import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'
import { displaySectionName } from '../lib/roles'
import { NewProjectModal } from './NewProjectModal'
import { ExcelToolbar } from './ExcelToolbar'

export function AppShell() {
  const { profile, user, caps, signOut } = useAuth()
  const { currentProject, sections, deleteProject } = useProject()
  const navigate = useNavigate()
  const [taskOpen, setTaskOpen] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const name = profile?.display_name || user?.email || 'User'
  const ship = currentProject?.ship_id || currentProject?.name || '—'
  const dept = currentProject?.department || 'Piping'

  async function onDeleteProject() {
    if (!currentProject?.id || !caps.canDeleteProject) return
    const label = currentProject.ship_id || currentProject.name || 'project này'
    const ok = window.confirm(
      `Xóa project ${label}?\nToàn bộ section + task sẽ bị xóa. Không hoàn tác được.`
    )
    if (!ok) return
    setDeleting(true)
    try {
      await deleteProject(currentProject.id)
      navigate('/dashboard')
    } catch (err) {
      window.alert(err.message || 'Xóa project thất bại')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className={`pm-app shell-${caps.shell}`}>
      <aside className="pm-sidebar">
        <div className="pm-sidebar-user">
          <div className="pm-avatar" style={profile?.theme_color ? { background: profile.theme_color } : undefined}>
            {name.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="pm-user-name">{name}</div>
            <div className={`pm-role-badge role-${caps.shell}`}>{caps.label}</div>
          </div>
        </div>

        <nav className="pm-menu">
          {caps.showDashboard && (
            <NavLink to="/dashboard" className="pm-menu-item">
              00 Dashboard
            </NavLink>
          )}

          <button type="button" className="pm-menu-item parent" onClick={() => setTaskOpen((v) => !v)}>
            Task <span>{taskOpen ? '▼' : '▶'}</span>
          </button>
          {taskOpen && (
            <div className="pm-submenu">
              {sections.length === 0 ? (
                <span className="pm-submenu-empty">Chưa có project / section</span>
              ) : (
                sections.map((s) => (
                  <NavLink key={s.id} to={`/sections/${s.id}`} className="pm-menu-item sub">
                    {displaySectionName(s.header_name)}
                  </NavLink>
                ))
              )}
            </div>
          )}

          {caps.showReviewRequests && (
            <NavLink to="/reviews" className="pm-menu-item">
              Review Requests
            </NavLink>
          )}

          <NavLink to="/summary" className="pm-menu-item">
            Summary
          </NavLink>

          {caps.showCalendar && (
            <NavLink to="/calendar" className="pm-menu-item">
              Calendar
            </NavLink>
          )}

          {caps.canManageUsers && (
            <NavLink to="/users" className="pm-menu-item">
              Users
            </NavLink>
          )}

          {caps.showReports && (
            <NavLink to="/reports" className="pm-menu-item muted-link">
              Reports
            </NavLink>
          )}

          {caps.showPlanDrawing && (
            <NavLink to="/plan-drawing" className="pm-menu-item muted-link">
              Plan Drawing
            </NavLink>
          )}
        </nav>
      </aside>

      <div className="pm-main">
        <header className="pm-header">
          <div className="pm-ship-panel">
            <div className="pm-ship-id">{ship}</div>
            <div className="pm-dept">{dept}</div>
          </div>

          <div className="pm-header-center">
            <h1>Progress Management</h1>
            <div className="pm-actions">
              {caps.canCreateProject && (
                <button type="button" className="pm-btn purple" onClick={() => setShowNew(true)}>
                  New
                </button>
              )}
              <ExcelToolbar />
              {caps.canDeleteProject && currentProject?.id ? (
                <button
                  type="button"
                  className="pm-btn danger"
                  disabled={deleting}
                  onClick={onDeleteProject}
                  title="Xóa project hiện tại (section + task)"
                >
                  {deleting ? 'Deleting…' : 'Xóa'}
                </button>
              ) : null}
              {caps.canManageUsers && (
                <button type="button" className="pm-btn green" onClick={() => navigate('/users')}>
                  Users
                </button>
              )}
              <button
                type="button"
                className="pm-btn ghost"
                onClick={async () => {
                  await signOut()
                  navigate('/login')
                }}
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </header>

        <div className="pm-content">
          <Outlet />
        </div>
      </div>

      {showNew && <NewProjectModal onClose={() => setShowNew(false)} />}
    </div>
  )
}
