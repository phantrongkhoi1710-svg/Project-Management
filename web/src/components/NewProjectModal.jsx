import { useState } from 'react'
import { useProject } from '../hooks/useProject'

export function NewProjectModal({ onClose }) {
  const { createProject } = useProject()
  const [shipId, setShipId] = useState('')
  const [department, setDepartment] = useState('Piping')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await createProject({ shipId, department, startDate, endDate })
      onClose()
    } catch (err) {
      setError(err.message || 'Tạo project thất bại')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pm-modal-backdrop" onClick={onClose}>
      <div className="pm-modal" onClick={(e) => e.stopPropagation()}>
        <h2>New Project</h2>
        <form className="form" onSubmit={onSubmit}>
          <label>
            Ship ID
            <input value={shipId} onChange={(e) => setShipId(e.target.value)} required placeholder="985" />
          </label>
          <label>
            Department
            <select value={department} onChange={(e) => setDepartment(e.target.value)}>
              <option>Piping</option>
              <option>Hull</option>
              <option>Machinery</option>
              <option>HVAC</option>
              <option>Outfitting</option>
            </select>
          </label>
          <label>
            Start date
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label>
            End date
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <div className="pm-modal-actions">
            <button type="button" className="pm-btn ghost" onClick={onClose}>
              Huỷ
            </button>
            <button type="submit" className="pm-btn purple" disabled={saving}>
              {saving ? 'Đang tạo…' : 'Tạo project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
