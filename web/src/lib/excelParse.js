import * as XLSX from 'xlsx'
import { excelDateToIso, mapExcelSectionToTarget, normalizePercent, normalizeVietnamese } from './progress'
import picMap from '../data/pic_abbreviation_mapping.json'

function sheetToMatrix(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true })
}

function findHeaderIndex(row) {
  const cells = row.map((c) => normalizeVietnamese(String(c)).toLowerCase())
  const hasActivity = cells.some((c) => c.includes('activity') || c.includes('task name') || c === 'task')
  const hasDrawing = cells.some((c) => c.includes('drawing'))
  return hasActivity || hasDrawing
}

function mapColumns(headerRow) {
  const cols = {}
  headerRow.forEach((cell, idx) => {
    const h = normalizeVietnamese(String(cell)).toLowerCase()
    if (h.includes('section') || h.includes('zone')) cols.section = idx
    else if (h.includes('activity') || h === 'task' || h.includes('task name')) cols.activity = idx
    else if (h.includes('drawing')) cols.drawingId = idx
    else if (h.includes('start')) cols.startDate = idx
    else if (h.includes('finish') || h.includes('end')) cols.finishDate = idx
    else if (h.includes('late')) cols.lateDate = idx
    else if (h.includes('assigned') || h === 'pic' || h.includes('p.i.c') || h.includes('pic ')) cols.pic = idx
    else if (h.includes('percent') || h === '%' || h.includes('%')) cols.percent = idx
  })
  return cols
}

function cell(row, idx) {
  if (idx == null || idx < 0) return ''
  const v = row[idx]
  return v == null ? '' : v
}

/**
 * Parse Piping VT style workbook → sections[{ headerName, activities[] }]
 */
export function parsePipingVtWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
  const sectionsMap = new Map()

  for (const sheetName of wb.SheetNames) {
    const matrix = sheetToMatrix(wb.Sheets[sheetName])
    if (!matrix.length) continue

    let headerRowIdx = -1
    let cols = null
    for (let i = 0; i < Math.min(matrix.length, 30); i++) {
      if (findHeaderIndex(matrix[i])) {
        headerRowIdx = i
        cols = mapColumns(matrix[i])
        break
      }
    }
    if (headerRowIdx < 0 || !cols?.activity) continue

    const defaultSection = mapExcelSectionToTarget(sheetName)

    for (let r = headerRowIdx + 1; r < matrix.length; r++) {
      const row = matrix[r]
      if (!row || row.every((c) => String(c).trim() === '')) continue
      const activity = String(cell(row, cols.activity)).trim()
      if (!activity) continue

      const sectionFromCol = cols.section != null ? String(cell(row, cols.section)).trim() : ''
      const zone = sectionFromCol || sheetName
      const target = mapExcelSectionToTarget(sectionFromCol || sheetName || defaultSection)

      if (!sectionsMap.has(target)) {
        sectionsMap.set(target, { headerName: target, activities: [] })
      }

      sectionsMap.get(target).activities.push({
        zone,
        activity,
        drawingId: String(cell(row, cols.drawingId)).trim(),
        startDate: excelDateToIso(cell(row, cols.startDate)) || '',
        finishDate: excelDateToIso(cell(row, cols.finishDate)) || '',
        lateDate: excelDateToIso(cell(row, cols.lateDate)) || '',
        percentComplete: normalizePercent(cell(row, cols.percent)),
        picRaw: String(cell(row, cols.pic)).trim(),
      })
    }
  }

  return Array.from(sectionsMap.values())
}

/**
 * Parse PIC / % sheets (3D, ISO, 2D, MTO)
 */
export function parsePicPercentWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
  const tasks = []

  for (const sheetName of wb.SheetNames) {
    const n = normalizeVietnamese(sheetName).toLowerCase()
    const relevant =
      n.includes('3d') || n.includes('iso') || n.includes('2d') || n.includes('mto') || n.includes('pipe')
    if (!relevant && wb.SheetNames.length > 1) {
      // still try if only generic sheets
    }

    const matrix = sheetToMatrix(wb.Sheets[sheetName])
    let headerRowIdx = -1
    let cols = null
    for (let i = 0; i < Math.min(matrix.length, 40); i++) {
      const mapped = mapColumns(matrix[i])
      if (mapped.activity != null && (mapped.pic != null || mapped.percent != null)) {
        headerRowIdx = i
        cols = mapped
        break
      }
    }
    if (headerRowIdx < 0 || !cols) continue

    for (let r = headerRowIdx + 1; r < matrix.length; r++) {
      const row = matrix[r]
      const activity = String(cell(row, cols.activity)).trim()
      if (!activity) continue
      let picRaw = String(cell(row, cols.pic)).trim()
      if (picMap[picRaw]) picRaw = picMap[picRaw]

      tasks.push({
        activity,
        drawingId: String(cell(row, cols.drawingId)).trim(),
        picFullNameNoDiacritics: normalizeVietnamese(picRaw),
        picRaw,
        percentComplete: normalizePercent(cell(row, cols.percent)),
        sheetName,
      })
    }
  }

  return tasks
}

export function fileToArrayBuffer(file) {
  return file.arrayBuffer()
}
