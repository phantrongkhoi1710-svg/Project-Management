import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'
import { computeWeightedProgress } from '../lib/progress'

export function DashboardPage() {
  const { caps, profile } = useAuth()
  const { currentProject, sections } = useProject()
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!currentProject?.id || !caps.showDashboard) {
      setStats(null)
      return
    }
    ;(async () => {
      const { data, error: err } = await supabase
        .from('tasks')
        .select('id, percent_complete, section_id')
        .eq('project_id', currentProject.id)
      if (err) {
        setError(err.message)
        return
      }
      const bySection = sections.map((s) => ({
        header_name: s.header_name,
        tasks: (data || []).filter((t) => t.section_id === s.id),
      }))
      setStats(computeWeightedProgress(bySection))
    })()
  }, [currentProject?.id, sections, caps.showDashboard])

  if (!caps.showDashboard) {
    return (
      <div className="pm-panel">
        <h2>Dashboard</h2>
        <p className="muted">Role của bạn dùng trang Summary.</p>
        <Link to="/summary">Đi tới Summary →</Link>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className={`pm-hero shell-${caps.shell}`}>
        <p className="eyebrow">{caps.label} workspace</p>
        <h2>00 Dashboard</h2>
        <p className="muted">
          {profile?.display_name} · Ship <strong>{currentProject?.ship_id || '—'}</strong>
        </p>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="pm-stat-grid">
        <div className="pm-stat">
          <span>Overall (weighted)</span>
          <strong>{stats?.overallProgress ?? 0}%</strong>
        </div>
        <div className="pm-stat">
          <span>Total tasks</span>
          <strong>{stats?.totalTasks ?? 0}</strong>
        </div>
        <div className="pm-stat">
          <span>Sections</span>
          <strong>{sections.length}</strong>
        </div>
      </div>

      <div className="pm-panel">
        <h3>Group progress (density)</h3>
        <p className="muted">3D 65% · ISO 15% · 2D 10% · MTO 10%</p>
        <div className="progress-bars">
          {(stats?.groups || []).map((g) => (
            <div key={g.name} className="progress-row">
              <div className="progress-label">
                <span>
                  {g.name} <em>({g.density})</em>
                </span>
                <strong>
                  {g.avgPercent}% · {g.total} tasks
                </strong>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${g.avgPercent}%` }} />
              </div>
            </div>
          ))}
          {!stats?.groups?.length ? <p className="muted">Chưa có task trong các nhóm tính %. Hãy Update Excel hoặc thêm task.</p> : null}
        </div>
      </div>

      <div className="pm-panel">
        <h3>By section</h3>
        <ul className="pm-quick">
          {(stats?.sectionStats || []).map((s) => (
            <li key={s.name}>
              {s.name}: {s.avgPercent}% ({s.total} tasks)
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
