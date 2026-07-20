import { supabase } from './supabase'
import { isMtoTask, mapExcelSectionToTarget, normalizeVietnamese } from './progress'
import { CANONICAL_SECTIONS } from './roles'

async function ensureSections(projectId, neededNames) {
  const { data: existing, error } = await supabase
    .from('sections')
    .select('id, header_name, sort_order')
    .eq('project_id', projectId)
  if (error) throw error

  const byName = new Map((existing || []).map((s) => [s.header_name, s]))
  const toInsert = []
  let order = (existing || []).reduce((m, s) => Math.max(m, s.sort_order || 0), -1) + 1

  for (const name of neededNames) {
    if (!byName.has(name)) {
      toInsert.push({ project_id: projectId, header_name: name, sort_order: order++ })
    }
  }

  if (toInsert.length) {
    const { data: inserted, error: insErr } = await supabase.from('sections').insert(toInsert).select('*')
    if (insErr) throw insErr
    inserted.forEach((s) => byName.set(s.header_name, s))
  }

  return byName
}

/**
 * Apply Piping VT excel sections into current project (upsert by activity+drawing within target section).
 */
export async function applyPipingVtImport(projectId, excelSections) {
  // Remap + extract MTO
  const grouped = new Map()

  for (const sec of excelSections) {
    for (const act of sec.activities || []) {
      let target = mapExcelSectionToTarget(sec.headerName)
      const task = {
        zone: act.zone || sec.headerName,
        activity: act.activity,
        drawing_id: act.drawingId || '',
        start_date: act.startDate || null,
        finish_date: act.finishDate || null,
        late_date: act.lateDate || null,
        percent_complete: act.percentComplete || 0,
        status: 'Not Started',
      }
      if (isMtoTask({ ...task, drawingId: task.drawing_id })) {
        target = 'MTO'
      }
      if (!grouped.has(target)) grouped.set(target, [])
      grouped.get(target).push(task)
    }
  }

  const names = [...new Set([...CANONICAL_SECTIONS, ...grouped.keys()])]
  const sectionByName = await ensureSections(projectId, names)

  let inserted = 0
  let updated = 0

  for (const [headerName, activities] of grouped.entries()) {
    const section = sectionByName.get(headerName)
    if (!section) continue

    const { data: existingTasks, error } = await supabase
      .from('tasks')
      .select('id, activity, drawing_id, assignee_id, percent_complete, status')
      .eq('section_id', section.id)
    if (error) throw error

    const map = new Map()
    ;(existingTasks || []).forEach((t) => {
      map.set(`${(t.activity || '').trim()}|||${(t.drawing_id || '').trim()}`, t)
      map.set(`${(t.activity || '').trim()}|||`, t)
    })

    for (const act of activities) {
      const keyDraw = `${act.activity}|||${act.drawing_id || ''}`
      const keyPlain = `${act.activity}|||`
      const found = map.get(keyDraw) || map.get(keyPlain)

      if (found) {
        const { error: upErr } = await supabase
          .from('tasks')
          .update({
            zone: act.zone,
            drawing_id: act.drawing_id || found.drawing_id,
            start_date: act.start_date || null,
            finish_date: act.finish_date || null,
            late_date: act.late_date || null,
            title: act.activity,
            activity: act.activity,
          })
          .eq('id', found.id)
        if (upErr) throw upErr
        updated += 1
      } else {
        const { error: inErr } = await supabase.from('tasks').insert({
          project_id: projectId,
          section_id: section.id,
          title: act.activity,
          activity: act.activity,
          zone: act.zone,
          drawing_id: act.drawing_id || '',
          start_date: act.start_date,
          finish_date: act.finish_date,
          late_date: act.late_date,
          percent_complete: 0,
          status: 'Not Started',
        })
        if (inErr) throw inErr
        inserted += 1
      }
    }
  }

  return { inserted, updated, sections: grouped.size }
}

/**
 * Update assignee + % from PIC excel rows.
 */
export async function applyPicPercentImport(projectId, excelTasks, profiles) {
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, activity, drawing_id, assignee_id, percent_complete')
    .eq('project_id', projectId)
  if (error) throw error

  const map = new Map()
  ;(tasks || []).forEach((t) => {
    const a = (t.activity || '').trim()
    const d = (t.drawing_id || '').trim()
    if (a) {
      if (d) map.set(`${a}|||${d}`, t)
      map.set(`${a}|||`, t)
    }
  })

  const profileByNorm = new Map()
  ;(profiles || []).forEach((p) => {
    profileByNorm.set(normalizeVietnamese(p.display_name || '').toLowerCase(), p)
    if (p.email) profileByNorm.set(normalizeVietnamese(p.email.split('@')[0]).toLowerCase(), p)
  })

  let matched = 0
  let updated = 0

  for (const row of excelTasks) {
    const activity = (row.activity || '').trim()
    if (!activity) continue
    const drawingId = (row.drawingId || '').trim()
    let task = drawingId ? map.get(`${activity}|||${drawingId}`) : null
    if (!task) task = map.get(`${activity}|||`)
    if (!task) continue
    matched += 1

    const patch = {}
    const picNorm = (row.picFullNameNoDiacritics || normalizeVietnamese(row.picRaw || '')).toLowerCase()
    if (picNorm) {
      const profile = profileByNorm.get(picNorm)
      if (profile && profile.id !== task.assignee_id) {
        patch.assignee_id = profile.id
      }
    }
    if (row.percentComplete > 0 && Math.abs(row.percentComplete - (task.percent_complete || 0)) > 0.01) {
      patch.percent_complete = row.percentComplete
    }

    if (Object.keys(patch).length) {
      const { error: upErr } = await supabase.from('tasks').update(patch).eq('id', task.id)
      if (upErr) throw upErr
      updated += 1
    }
  }

  return { matched, updated, totalExcel: excelTasks.length }
}
