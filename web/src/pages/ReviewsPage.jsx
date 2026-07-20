import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'

export function ReviewsPage() {
  const { caps } = useAuth()
  const { currentProject } = useProject()
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!caps.canReviewTasks) return
    setLoading(true)
    let query = supabase
      .from('tasks')
      .select('id, activity, zone, percent_complete, project_id, review_requested_at, assignee_id, rejection_comment')
      .eq('pending_review', true)
      .order('review_requested_at', { ascending: false })

    if (currentProject?.id) {
      query = query.eq('project_id', currentProject.id)
    }

    const { data, error: err } = await query
    if (err) setError(err.message)
    setItems(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [currentProject?.id, caps.canReviewTasks])

  async function approve(id) {
    const { error: err } = await supabase
      .from('tasks')
      .update({
        pending_review: false,
        status: 'Completed',
        percent_complete: 100,
        rejection_comment: null,
      })
      .eq('id', id)
    if (err) setError(err.message)
    else await load()
  }

  async function reject(id) {
    const comment = window.prompt('Lý do reject?') || 'Need correction'
    const { error: err } = await supabase
      .from('tasks')
      .update({
        pending_review: false,
        rejection_comment: comment,
        status: 'In Progress',
      })
      .eq('id', id)
    if (err) setError(err.message)
    else await load()
  }

  if (!caps.canReviewTasks) {
    return (
      <div className="pm-panel">
        <h2>Review Requests</h2>
        <p className="muted">Role của bạn không duyệt review. Hãy Submit Review từ trang Task.</p>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className={`pm-hero shell-${caps.shell}`}>
        <h2>Review Requests</h2>
        <p className="muted">Duyệt task pending của ship {currentProject?.ship_id || '—'}.</p>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : items.length === 0 ? (
        <p className="muted">Không có request nào.</p>
      ) : (
        <ul className="pm-review-list">
          {items.map((t) => (
            <li key={t.id} className="pm-panel">
              <strong>{t.activity || 'Task'}</strong>
              <p className="muted">
                {t.zone || '—'} · {t.percent_complete ?? 0}% ·{' '}
                {t.review_requested_at ? new Date(t.review_requested_at).toLocaleString() : ''}
              </p>
              <div className="pm-modal-actions">
                <button type="button" className="pm-btn green" onClick={() => approve(t.id)}>
                  Approve
                </button>
                <button type="button" className="pm-btn ghost" onClick={() => reject(t.id)}>
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
