import { useProject } from '../hooks/useProject'

export function LoadProjectModal({ onClose }) {
  const { projects, selectProject, loading, error } = useProject()

  return (
    <div className="pm-modal-backdrop" onClick={onClose}>
      <div className="pm-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Load Project</h2>
        {error ? <p className="error">{error}</p> : null}
        {loading ? (
          <p className="muted">Đang tải…</p>
        ) : projects.length === 0 ? (
          <p className="muted">Chưa có project. Hãy tạo New.</p>
        ) : (
          <ul className="pm-project-pick">
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={async () => {
                    await selectProject(p)
                    onClose()
                  }}
                >
                  <strong>{p.ship_id || p.name}</strong>
                  <span>
                    {p.department} · {p.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="pm-btn ghost" onClick={onClose}>
          Đóng
        </button>
      </div>
    </div>
  )
}
