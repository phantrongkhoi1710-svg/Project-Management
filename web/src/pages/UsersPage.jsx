import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const POSITIONS = ['Admin', 'Manager', 'Senior', 'Engineer', 'Designer']

export function UsersPage() {
  const { caps } = useAuth()
  const [users, setUsers] = useState([])
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, email, display_name, employee_id, position, theme_color')
      .order('employee_id', { ascending: true, nullsFirst: false })
    if (err) setError(err.message)
    setUsers(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  if (!caps.canManageUsers) {
    return <Navigate to="/" replace />
  }

  async function saveUser(user) {
    setSavingId(user.id)
    setError('')
    const { error: err } = await supabase
      .from('profiles')
      .update({
        display_name: user.display_name,
        employee_id: user.employee_id || null,
        position: user.position,
        theme_color: user.theme_color || null,
      })
      .eq('id', user.id)
    if (err) setError(err.message)
    setSavingId('')
  }

  function patch(id, fields) {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...fields } : u)))
  }

  return (
    <div className="stack">
      <div className="pm-hero shell-manager">
        <h2>User Management</h2>
        <p className="muted">Sửa tên, mã NV, position, màu theme. Tạo account Auth mới vẫn dùng script import.</p>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : (
        <div className="pm-table-wrap">
          <table className="pm-table">
            <thead>
              <tr>
                <th>Mã NV</th>
                <th>Tên</th>
                <th>Email</th>
                <th>Position</th>
                <th>Theme</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <input value={u.employee_id || ''} onChange={(e) => patch(u.id, { employee_id: e.target.value })} />
                  </td>
                  <td>
                    <input value={u.display_name || ''} onChange={(e) => patch(u.id, { display_name: e.target.value })} />
                  </td>
                  <td className="muted">{u.email}</td>
                  <td>
                    <select value={u.position || 'Engineer'} onChange={(e) => patch(u.id, { position: e.target.value })}>
                      {POSITIONS.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="color"
                      value={u.theme_color || '#2f6f9f'}
                      onChange={(e) => patch(u.id, { theme_color: e.target.value })}
                    />
                  </td>
                  <td>
                    <button type="button" className="pm-btn tiny green" disabled={savingId === u.id} onClick={() => saveUser(u)}>
                      {savingId === u.id ? '…' : 'Save'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
