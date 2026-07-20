import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

function friendlyError(err) {
  const msg = err?.message || ''
  if (msg.includes('Invalid login credentials')) return 'Email hoặc mật khẩu không đúng.'
  if (msg.includes('Email not confirmed')) return 'Email chưa được xác nhận.'
  return msg || 'Đăng nhập thất bại.'
}

export function LoginPage() {
  const { session, loading, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!loading && session) {
    return <Navigate to="/" replace />
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await signIn(email.trim(), password)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-scene">
      <div className="login-card">
        <p className="brand">Project Manager</p>
        <h1>Đăng nhập</h1>
        <p className="muted">Dùng email và mật khẩu đã được cấp.</p>

        <form className="form" onSubmit={onSubmit}>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ban@vard.com"
              required
            />
          </label>
          <label>
            Mật khẩu
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tối thiểu 6 ký tự"
              minLength={6}
              required
            />
          </label>
          <button type="submit" className="btn primary" disabled={submitting}>
            {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>

        {error ? <p className="error">{error}</p> : null}
      </div>
    </div>
  )
}
