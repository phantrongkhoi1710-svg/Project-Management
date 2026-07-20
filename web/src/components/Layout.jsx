import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function Layout() {
  const { profile, user, signOut } = useAuth()
  const name = profile?.display_name || user?.email || 'User'

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          Project Manager
        </Link>
        <div className="topbar-right">
          <span className="user-label">{name}</span>
          <button type="button" className="btn ghost" onClick={() => signOut()}>
            Đăng xuất
          </button>
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </div>
  )
}
