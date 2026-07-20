import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'

export function DashboardPage() {
  const { caps, profile } = useAuth()
  const { currentProject, sections } = useProject()

  if (!caps.showDashboard) {
    return (
      <div className="pm-panel">
        <h2>Dashboard</h2>
        <p className="muted">Role của bạn dùng trang Summary thay cho Dashboard tổng.</p>
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
          Xin chào {profile?.display_name || 'bạn'}. Ship hiện tại:{' '}
          <strong>{currentProject?.ship_id || 'chưa chọn'}</strong>
        </p>
      </div>

      <div className="pm-stat-grid">
        <div className="pm-stat">
          <span>Sections</span>
          <strong>{sections.length}</strong>
        </div>
        <div className="pm-stat">
          <span>Department</span>
          <strong>{currentProject?.department || '—'}</strong>
        </div>
        <div className="pm-stat">
          <span>Status</span>
          <strong>{currentProject?.status || '—'}</strong>
        </div>
      </div>

      <div className="pm-panel">
        <h3>Quick links</h3>
        <ul className="pm-quick">
          {sections.slice(0, 4).map((s) => (
            <li key={s.id}>
              <Link to={`/sections/${s.id}`}>{s.header_name}</Link>
            </li>
          ))}
          {caps.showReviewRequests && (
            <li>
              <Link to="/reviews">Review Requests</Link>
            </li>
          )}
        </ul>
        <p className="muted">Biểu đồ % weighted (3D/ISO/2D/MTO) sẽ bổ sung khi có task data.</p>
      </div>
    </div>
  )
}
