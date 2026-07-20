import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'
import { displaySectionName } from '../lib/roles'

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function ymd(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function CalendarPage() {
  const { caps, user } = useAuth()
  const { currentProject, sections } = useProject()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [sectionId, setSectionId] = useState('')
  const [tasks, setTasks] = useState([])
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!currentProject?.id) {
      setTasks([])
      return
    }
    let query = supabase
      .from('tasks')
      .select('id, activity, drawing_id, start_date, finish_date, late_date, percent_complete, section_id, assignee_id, status')
      .eq('project_id', currentProject.id)

    if (sectionId) query = query.eq('section_id', sectionId)
    if (caps.canEditAssignedOnly) query = query.eq('assignee_id', user.id)

    query.then(({ data, error: err }) => {
      if (err) setError(err.message)
      setTasks(data || [])
      setSelectedTaskId('')
    })
  }, [currentProject?.id, sectionId, caps.canEditAssignedOnly, user?.id])

  const focusTask = tasks.find((t) => t.id === selectedTaskId)

  const markers = useMemo(() => {
    const map = new Map()
    const list = focusTask ? [focusTask] : tasks
    list.forEach((t) => {
      ;['start_date', 'finish_date', 'late_date'].forEach((field) => {
        const d = t[field]
        if (!d) return
        if (!map.has(d)) map.set(d, [])
        map.get(d).push({ task: t, type: field })
      })
    })
    return map
  }, [tasks, focusTask])

  const counts = useMemo(() => {
    let start = 0
    let finish = 0
    let late = 0
    markers.forEach((arr) => {
      arr.forEach((m) => {
        if (m.type === 'start_date') start += 1
        if (m.type === 'finish_date') finish += 1
        if (m.type === 'late_date') late += 1
      })
    })
    return { start, finish, late }
  }, [markers])

  function shiftMonth(delta) {
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
  }

  const firstDow = new Date(year, month, 1).getDay()
  const totalDays = daysInMonth(year, month)
  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= totalDays; d++) cells.push(d)

  const monthLabel = new Date(year, month, 1).toLocaleString('vi-VN', { month: 'long', year: 'numeric' })

  return (
    <div className="calendar-page">
      <aside className="calendar-filters">
        <h3>Calendar Filters</h3>
        <label>
          Section
          <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">All sections</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {displaySectionName(s.header_name)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Task
          <select value={selectedTaskId} onChange={(e) => setSelectedTaskId(e.target.value)}>
            <option value="">All tasks in filter</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.activity || 'Task'} {t.drawing_id ? `| ${t.drawing_id}` : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="calendar-legend">
          <span>
            <i className="dot start" /> Start: {counts.start}
          </span>
          <span>
            <i className="dot finish" /> Finish: {counts.finish}
          </span>
          <span>
            <i className="dot late" /> Late: {counts.late}
          </span>
        </div>
        {error ? <p className="error">{error}</p> : null}
      </aside>

      <div className="calendar-main">
        <div className="calendar-topbar">
          <h2>{monthLabel}</h2>
          <div className="pm-actions">
            <button type="button" className="pm-btn ghost" onClick={() => shiftMonth(-1)}>
              ◀
            </button>
            <button
              type="button"
              className="pm-btn ghost"
              onClick={() => {
                setYear(today.getFullYear())
                setMonth(today.getMonth())
              }}
            >
              Today
            </button>
            <button type="button" className="pm-btn ghost" onClick={() => shiftMonth(1)}>
              ▶
            </button>
          </div>
        </div>

        <div className="calendar-grid">
          {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map((d) => (
            <div key={d} className="cal-head">
              {d}
            </div>
          ))}
          {cells.map((day, idx) => {
            if (day == null) return <div key={`e-${idx}`} className="cal-cell empty" />
            const key = ymd(year, month, day)
            const marks = markers.get(key) || []
            const isToday =
              day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
            return (
              <div key={key} className={`cal-cell ${isToday ? 'today' : ''}`}>
                <div className="cal-day">{day}</div>
                <div className="cal-marks">
                  {marks.slice(0, 4).map((m, i) => (
                    <span key={i} className={`cal-chip ${m.type}`} title={m.task.activity}>
                      {m.type === 'start_date' ? 'S' : m.type === 'finish_date' ? 'F' : 'L'}
                    </span>
                  ))}
                  {marks.length > 4 ? <span className="cal-more">+{marks.length - 4}</span> : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
