/**
 * CLI: parse Engineering Plans xlsx and optionally upload to Supabase.
 *
 * Usage:
 *   node scripts/import-engineering-plans.mjs "path\to\file.xlsx"
 *   node scripts/import-engineering-plans.mjs "file.xlsx" --upload --ship=994
 *
 * Env (root .env):
 *   SUPABASE_URL=
 *   SUPABASE_SERVICE_ROLE_KEY=
 *   IMPORT_AS_USER_ID=   # auth user uuid (project owner)
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const requireFromWeb = createRequire(resolve(root, 'web/package.json'))
const XLSX = requireFromWeb('xlsx')
const { createClient } = requireFromWeb('@supabase/supabase-js')

function loadEnv() {
  for (const p of [resolve(root, '.env'), resolve(root, 'web/.env.local')]) {
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq < 1) continue
      const k = t.slice(0, eq).trim()
      let v = t.slice(eq + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (!process.env[k]) process.env[k] = v
    }
  }
}

function normalizeVietnamese(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim()
}

function normalizePercent(value) {
  if (value == null || value === '') return 0
  if (typeof value === 'number') {
    if (value > 0 && value <= 1) return Math.round(value * 100)
    return Math.round(value)
  }
  const s = String(value).replace('%', '').trim()
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n) : 0
}

function excelDateToIso(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = XLSX.SSF.parse_date_code(value)
    if (!d) return null
    const mm = String(d.m).padStart(2, '0')
    const dd = String(d.d).padStart(2, '0')
    return `${d.y}-${mm}-${dd}`
  }
  const s = String(value || '').trim()
  if (!s) return null
  const cleaned = s.replace(/\s*A\s*$/i, '').trim()
  const t = Date.parse(cleaned)
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10)
  return null
}

function leadingSpaces(value) {
  const m = String(value ?? '').match(/^[ ]*/)
  return (m?.[0] || '').length
}

function cell(row, idx) {
  if (idx == null || idx < 0) return ''
  const v = row[idx]
  return v == null ? '' : v
}

function mapHeader(headerRow) {
  const cols = {}
  headerRow.forEach((raw, idx) => {
    const h = normalizeVietnamese(String(raw || ''))
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
    if (!h) return
    if (h === 'vessel') cols.vessel = idx
    else if (h === 'drawing id' || h === 'drawingid') cols.drawingId = idx
    else if (h === 'activity id' || h === 'activityid') cols.activityId = idx
    else if (h === 'activity name' || h === 'activity') cols.activityName = idx
    else if (h === 'engineer') cols.engineer = idx
    else if (h === 'activity status' || h === 'status') cols.status = idx
    else if (h === 'start') cols.start = idx
    else if (h === 'finish') cols.finish = idx
    else if (h.includes('late finish') || h === 'late') cols.late = idx
    else if (h.includes('performance') && h.includes('%')) cols.percent = idx
    else if (h.includes('% complete') && cols.percent == null) cols.percent = idx
  })
  return cols
}

function normalizeStatus(raw) {
  const s = String(raw || '').trim().toLowerCase()
  if (s.includes('complete')) return 'Completed'
  if (s.includes('progress')) return 'In Progress'
  if (s.includes('hold')) return 'On Hold'
  if (s.includes('not started') || !s) return 'Not Started'
  return String(raw || 'Not Started').trim()
}

function parseExcelDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  const s = String(value || '').trim()
  if (!s) return null
  return excelDateToIso(s.replace(/\s*A\s*$/i, '').trim()) || excelDateToIso(value)
}

function parseEngineeringPlansWorkbook(buf) {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true })
  const sheetName = wb.SheetNames[0]
  const matrix = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    defval: '',
    raw: true,
  })
  if (!matrix.length) {
    return { shipHint: null, tasks: [], sections: [], stats: { totalRows: 0 } }
  }

  const cols = mapHeader(matrix[0] || [])
  if (cols.vessel == null) cols.vessel = 0
  if (cols.drawingId == null || cols.activityName == null) {
    throw new Error('File thiếu cột Drawing ID / Activity Name')
  }

  const stack = []
  let currentResource = null
  const tasks = []
  const sectionMap = new Map()
  let shipHint = null
  let skippedResourceRows = 0
  let skippedSummaryRows = 0

  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r]
    const rawVessel = String(cell(row, cols.vessel) ?? '')
    const label = rawVessel.trim()
    const spaces = leadingSpaces(rawVessel)
    const drawing = String(cell(row, cols.drawingId)).trim()
    const activity = String(cell(row, cols.activityName)).trim()

    if (drawing && activity) {
      const vesselNum = label.replace(/\D/g, '')
      if (vesselNum && !shipHint) {
        shipHint = vesselNum.length === 4 && vesselNum.startsWith('1') ? vesselNum.slice(1) : vesselNum
      }
      const sectionName = stack.length ? stack[stack.length - 1].name : 'Unassigned'
      const wbsPath = stack.map((s) => s.name).join(' > ')
      sectionMap.set(sectionName, (sectionMap.get(sectionName) || 0) + 1)
      tasks.push({
        sectionName,
        wbsPath,
        resource: currentResource,
        zone: sectionName,
        activity,
        drawingId: drawing,
        externalActivityId: String(cell(row, cols.activityId)).trim() || null,
        engineerAbbrev: String(cell(row, cols.engineer)).trim() || null,
        status: normalizeStatus(cell(row, cols.status)),
        percentComplete: (() => {
          const st = normalizeStatus(cell(row, cols.status))
          let pct = normalizePercent(cell(row, cols.percent))
          if (st === 'Completed' && !pct) pct = 100
          return pct
        })(),
        startDate: parseExcelDate(cell(row, cols.start)),
        finishDate: parseExcelDate(cell(row, cols.finish)),
        lateDate: parseExcelDate(cell(row, cols.late)),
      })
      continue
    }

    if (!label) continue
    if (/^\d+$/.test(label)) {
      skippedSummaryRows += 1
      continue
    }
    if (/^resources\s*:/i.test(label)) {
      currentResource = label.replace(/^resources\s*:\s*/i, '').trim()
      skippedResourceRows += 1
      continue
    }
    while (stack.length && stack[stack.length - 1].spaces >= spaces) stack.pop()
    stack.push({ spaces, name: label })
    currentResource = null
    skippedSummaryRows += 1
  }

  const sections = [...sectionMap.entries()].map(([name, taskCount]) => ({ name, taskCount }))

  return {
    sheetName,
    shipHint,
    tasks,
    sections,
    stats: {
      totalRows: matrix.length - 1,
      taskCount: tasks.length,
      sectionCount: sections.length,
      skippedResourceRows,
      skippedSummaryRows,
    },
  }
}

loadEnv()

const args = process.argv.slice(2)
const fileArg = args.find((a) => !a.startsWith('--'))
const doUpload = args.includes('--upload')
const shipArg = (args.find((a) => a.startsWith('--ship=')) || '').split('=')[1]

if (!fileArg) {
  console.error('Thiếu đường dẫn file xlsx')
  process.exit(1)
}

const filePath = resolve(fileArg)
const buf = readFileSync(filePath)
const parsed = parseEngineeringPlansWorkbook(buf)

console.log('Sheet:', parsed.sheetName)
console.log('Ship hint:', parsed.shipHint)
console.log('Stats:', parsed.stats)
console.log('Sections (top 15):')
parsed.sections
  .slice()
  .sort((a, b) => b.taskCount - a.taskCount)
  .slice(0, 15)
  .forEach((s) => console.log(`  ${String(s.taskCount).padStart(4)}  ${s.name}`))

console.log('\nSample tasks:')
parsed.tasks.slice(0, 5).forEach((t) => {
  console.log({
    section: t.sectionName,
    resource: t.resource,
    wbs: t.wbsPath,
    drawing: t.drawingId,
    activity: t.activity.slice(0, 50),
    status: t.status,
    pct: t.percentComplete,
    eng: t.engineerAbbrev,
  })
})

if (!doUpload) {
  console.log('\n(Chỉ parse. Thêm --upload --ship=994 để ghi Supabase)')
  process.exit(0)
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const userId = process.env.IMPORT_AS_USER_ID
if (!url || !key) {
  console.error('Cần SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY trong .env')
  process.exit(1)
}
if (!userId) {
  console.error('Cần IMPORT_AS_USER_ID=uuid user (owner project) trong .env')
  process.exit(1)
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const ship = shipArg || parsed.shipHint
console.log('\nUploading to ship', ship, 'as', userId)

const { data: existingProj } = await supabase.from('projects').select('*').eq('ship_id', ship).limit(1)
let project = existingProj?.[0]
if (!project) {
  const { data, error } = await supabase
    .from('projects')
    .insert({
      name: ship,
      ship_id: ship,
      department: 'Engineering',
      status: 'In Progress',
      owner_id: userId,
    })
    .select('*')
    .single()
  if (error) throw error
  project = data
  await supabase.from('project_members').insert({ project_id: project.id, user_id: userId, role: 'owner' })
}

const sectionNames = [...new Set(parsed.tasks.map((t) => t.sectionName))]
const { data: existingSecs } = await supabase.from('sections').select('*').eq('project_id', project.id)
const secMap = new Map((existingSecs || []).map((s) => [s.header_name, s]))
let order = (existingSecs || []).reduce((m, s) => Math.max(m, s.sort_order || 0), -1) + 1
const missing = sectionNames
  .filter((n) => !secMap.has(n))
  .map((header_name) => ({ project_id: project.id, header_name, sort_order: order++ }))
if (missing.length) {
  const { data, error } = await supabase.from('sections').insert(missing).select('*')
  if (error) throw error
  data.forEach((s) => secMap.set(s.header_name, s))
}

const { data: existingTasks } = await supabase
  .from('tasks')
  .select('id, external_activity_id, drawing_id, activity')
  .eq('project_id', project.id)
const byExt = new Map(
  (existingTasks || []).filter((t) => t.external_activity_id).map((t) => [String(t.external_activity_id), t])
)

let inserted = 0
let updated = 0
const BATCH = 100
const inserts = []
const updates = []

for (const row of parsed.tasks) {
  const section = secMap.get(row.sectionName)
  const payload = {
    project_id: project.id,
    section_id: section.id,
    title: row.activity,
    activity: row.activity,
    drawing_id: row.drawingId,
    zone: row.zone,
    resource: row.resource,
    wbs_path: row.wbsPath,
    external_activity_id: row.externalActivityId,
    status: row.status,
    percent_complete: row.percentComplete || 0,
    start_date: row.startDate,
    finish_date: row.finishDate,
    late_date: row.lateDate,
  }
  const ex = row.externalActivityId && byExt.get(String(row.externalActivityId))
  if (ex) updates.push({ id: ex.id, ...payload })
  else inserts.push(payload)
}

for (let i = 0; i < inserts.length; i += BATCH) {
  const chunk = inserts.slice(i, i + BATCH)
  const { error } = await supabase.from('tasks').insert(chunk)
  if (error) throw error
  inserted += chunk.length
  process.stdout.write(`insert ${inserted}/${inserts.length}\r`)
}
console.log('')

for (const row of updates) {
  const { id, ...rest } = row
  const { error } = await supabase.from('tasks').update(rest).eq('id', id)
  if (error) throw error
  updated += 1
}

console.log('Done:', { projectId: project.id, ship, inserted, updated, sections: sectionNames.length })
