import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

export function DashboardPage() {
  const { user } = useAuth()
  const [projects, setProjects] = useState([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function loadProjects() {
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase
      .from('projects')
      .select('id, name, description, status, created_at')
      .order('created_at', { ascending: false })
    if (err) setError(err.message)
    else setProjects(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadProjects()
  }, [])

  async function createProject(e) {
    e.preventDefault()
    if (!name.trim() || !user) return
    setSaving(true)
    setError('')

    const { data: project, error: createErr } = await supabase
      .from('projects')
      .insert({
        name: name.trim(),
        description: description.trim() || null,
        owner_id: user.id,
      })
      .select('id')
      .single()

    if (createErr) {
      setError(createErr.message)
      setSaving(false)
      return
    }

    const { error: memberErr } = await supabase.from('project_members').insert({
      project_id: project.id,
      user_id: user.id,
      role: 'owner',
    })

    if (memberErr) {
      setError(memberErr.message)
      setSaving(false)
      return
    }

    setName('')
    setDescription('')
    setSaving(false)
    await loadProjects()
  }

  return (
    <div className="stack">
      <div className="section-head">
        <h1>Dự án</h1>
        <p className="muted">Danh sách dự án bạn đang tham gia.</p>
      </div>

      <form className="panel form" onSubmit={createProject}>
        <h2>Tạo dự án mới</h2>
        <label>
          Tên dự án
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ví dụ: Website nội bộ" />
        </label>
        <label>
          Mô tả
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Tuỳ chọn" />
        </label>
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? 'Đang tạo…' : 'Tạo dự án'}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : projects.length === 0 ? (
        <p className="muted">Chưa có dự án nào.</p>
      ) : (
        <ul className="project-list">
          {projects.map((p) => (
            <li key={p.id}>
              <Link to={`/projects/${p.id}`} className="project-link">
                <strong>{p.name}</strong>
                <span className="muted">{p.description || 'Không có mô tả'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
