import { supabase } from './supabase'
import { mapExcelSectionToTarget } from './progress'
import { CANONICAL_SECTIONS } from './roles'

async function ensureCanonicalSections(projectId) {
  const { data: existing, error } = await supabase
    .from('sections')
    .select('id, header_name, sort_order')
    .eq('project_id', projectId)
  if (error) throw error

  const byName = new Map((existing || []).map((s) => [s.header_name, s]))
  let order = (existing || []).reduce((m, s) => Math.max(m, s.sort_order || 0), -1) + 1
  const missing = CANONICAL_SECTIONS.filter((n) => !byName.has(n)).map((header_name) => ({
    project_id: projectId,
    header_name,
    sort_order: CANONICAL_SECTIONS.indexOf(header_name),
  }))

  if (missing.length) {
    const { data: inserted, error: insErr } = await supabase.from('sections').insert(missing).select('*')
    if (insErr) throw insErr
    inserted.forEach((s) => byName.set(s.header_name, s))
  }

  await Promise.all(
    CANONICAL_SECTIONS.map(async (name, sort_order) => {
      const sec = byName.get(name)
      if (!sec || sec.sort_order === sort_order) return
      await supabase.from('sections').update({ sort_order }).eq('id', sec.id)
      sec.sort_order = sort_order
    })
  )

  return byName
}

function sourceSectionName(task, sectionById) {
  const fromSection = sectionById.get(task.section_id)?.header_name
  if (fromSection) return fromSection
  if (task.zone) return String(task.zone).trim()
  if (task.wbs_path) {
    const parts = String(task.wbs_path)
      .split('>')
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length) return parts[parts.length - 1]
  }
  return ''
}

function isPipingVt(resource, filter) {
  const res = String(resource || '')
    .trim()
    .toLowerCase()
  if (!filter) return true
  return res === filter || res.includes(filter)
}

/**
 * Remap Piping VT → canonical sections (như bin), rồi dọn sidebar:
 * chỉ giữ section chuẩn có task.
 */
export async function applyPipingVtSectionMapping(projectId, { resourceFilter = 'Piping VT' } = {}) {
  if (!projectId) throw new Error('Thiếu project')

  const sectionByName = await ensureCanonicalSections(projectId)
  const sectionById = new Map([...sectionByName.values()].map((s) => [s.id, s]))

  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, section_id, zone, wbs_path, resource, activity, drawing_id')
    .eq('project_id', projectId)
  if (error) throw error

  const filter = String(resourceFilter || '')
    .trim()
    .toLowerCase()
  const all = tasks || []
  const candidates = all.filter((t) => isPipingVt(t.resource, filter))
  const others = all.filter((t) => !isPipingVt(t.resource, filter))

  if (!candidates.length) {
    return { moved: 0, total: 0, byTarget: {}, message: `Không có task resource="${resourceFilter}"` }
  }

  const byTarget = {}
  let moved = 0
  const BATCH = 40
  const updates = []

  for (const task of candidates) {
    const source = sourceSectionName(task, sectionById)
    const target = mapExcelSectionToTarget(source)
    const dest = sectionByName.get(target)
    if (!dest) continue

    byTarget[target] = (byTarget[target] || 0) + 1
    if (task.section_id === dest.id && task.zone === target) continue

    updates.push({ id: task.id, section_id: dest.id, zone: target })
  }

  for (let i = 0; i < updates.length; i += BATCH) {
    const chunk = updates.slice(i, i + BATCH)
    await Promise.all(
      chunk.map(async (row) => {
        const { error: upErr } = await supabase
          .from('tasks')
          .update({ section_id: row.section_id, zone: row.zone })
          .eq('id', row.id)
        if (upErr) throw upErr
        moved += 1
      })
    )
  }

  // Bỏ task không thuộc Piping VT (Naval/Hydro/… của team khác)
  let deletedOtherTasks = 0
  if (others.length) {
    for (let i = 0; i < others.length; i += BATCH) {
      const ids = others.slice(i, i + BATCH).map((t) => t.id)
      const { error: delErr } = await supabase.from('tasks').delete().in('id', ids)
      if (delErr) throw delErr
      deletedOtherTasks += ids.length
    }
  }

  // Xóa mọi section không thuộc bộ chuẩn (Naval, Hydro, Structure, …)
  const { data: allSecs } = await supabase
    .from('sections')
    .select('id, header_name')
    .eq('project_id', projectId)
  const canonical = new Set(CANONICAL_SECTIONS)
  const nonCanonical = (allSecs || []).filter((s) => !canonical.has(s.header_name))
  if (nonCanonical.length) {
    const { error: delSecErr } = await supabase.from('sections').delete().in(
      'id',
      nonCanonical.map((s) => s.id)
    )
    if (delSecErr) throw delSecErr
  }

  // Ẩn section chuẩn trống (chỉ hiện section có task — như bin)
  const { data: remainTasks } = await supabase.from('tasks').select('section_id').eq('project_id', projectId)
  const used = new Set((remainTasks || []).map((t) => t.section_id))
  const emptyCanonical = (allSecs || []).filter(
    (s) => canonical.has(s.header_name) && !used.has(s.id)
  )
  // re-fetch after nonCanonical delete — empty among remaining canonical
  const { data: leftSecs } = await supabase
    .from('sections')
    .select('id, header_name')
    .eq('project_id', projectId)
  const emptyLeft = (leftSecs || []).filter((s) => !used.has(s.id))
  if (emptyLeft.length) {
    await supabase.from('sections').delete().in(
      'id',
      emptyLeft.map((s) => s.id)
    )
  }

  return {
    moved,
    total: candidates.length,
    byTarget,
    deletedOtherTasks,
    deletedSections: nonCanonical.length + emptyLeft.length,
  }
}
