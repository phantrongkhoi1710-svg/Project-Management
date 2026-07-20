import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'
import { parsePipingVtWorkbook, parsePicPercentWorkbook, fileToArrayBuffer } from '../lib/excelParse'
import { applyPipingVtImport, applyPicPercentImport } from '../lib/excelImport'
import { supabase } from '../lib/supabase'

export function ExcelToolbar() {
  const { caps } = useAuth()
  const { currentProject, reloadSections } = useProject()
  const updateRef = useRef(null)
  const picRef = useRef(null)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')

  if (!caps.canImportExcel) return null

  async function onUpdateFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!currentProject?.id) {
      setMessage('Hãy Load/New project trước.')
      return
    }
    setBusy('update')
    setMessage('')
    try {
      const buf = await fileToArrayBuffer(file)
      const sections = parsePipingVtWorkbook(buf)
      if (!sections.length) {
        setMessage('Không đọc được section/task từ Excel. Cần cột Activity (+ Drawing/Start/Finish).')
        return
      }
      const result = await applyPipingVtImport(currentProject.id, sections)
      await reloadSections()
      setMessage(`Update xong: +${result.inserted} task mới, ${result.updated} cập nhật, ${result.sections} section.`)
    } catch (err) {
      setMessage(err.message || 'Update Excel thất bại')
    } finally {
      setBusy('')
    }
  }

  async function onPicFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!currentProject?.id) {
      setMessage('Hãy Load/New project trước.')
      return
    }
    setBusy('pic')
    setMessage('')
    try {
      const buf = await fileToArrayBuffer(file)
      const rows = parsePicPercentWorkbook(buf)
      if (!rows.length) {
        setMessage('Không đọc được PIC/% từ Excel.')
        return
      }
      const { data: profiles } = await supabase.from('profiles').select('id, display_name, email')
      const result = await applyPicPercentImport(currentProject.id, rows, profiles || [])
      setMessage(`Load Assigned & %: match ${result.matched}/${result.totalExcel}, cập nhật ${result.updated}.`)
    } catch (err) {
      setMessage(err.message || 'Load PIC thất bại')
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      <input ref={updateRef} type="file" accept=".xlsx,.xls" hidden onChange={onUpdateFile} />
      <input ref={picRef} type="file" accept=".xlsx,.xls" hidden onChange={onPicFile} />
      <button
        type="button"
        className="pm-btn blue"
        disabled={!!busy}
        onClick={() => updateRef.current?.click()}
        title="Import task từ Excel (Piping VT)"
      >
        {busy === 'update' ? 'Updating…' : 'Update'}
      </button>
      <button
        type="button"
        className="pm-btn blue"
        disabled={!!busy}
        onClick={() => picRef.current?.click()}
        title="Load assigned + % từ Excel"
      >
        {busy === 'pic' ? 'Loading…' : 'Load Assigned & %'}
      </button>
      {message ? <span className="pm-excel-msg">{message}</span> : null}
    </>
  )
}
