import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'

export function SummaryPage() {
  const { caps, profile } = useAuth()
  const { currentProject } = useProject()

  if (caps.shell === 'engineer') {
    return (
      <div className="stack">
        <div className="pm-hero shell-engineer">
          <p className="eyebrow">Engineer Summary</p>
          <h2>Việc của tôi</h2>
          <p className="muted">
            {profile?.display_name} — chỉ thấy / cập nhật task được gán. % tối đa{' '}
            <strong>{caps.percentCap}%</strong> trước khi review.
          </p>
        </div>
        <div className="pm-panel">
          <p>
            Ship: <strong>{currentProject?.ship_id || 'Chưa load project'}</strong>
          </p>
          <p className="muted">Mở menu Task → chọn section để làm việc. Nút Submit Review có trên từng task.</p>
        </div>
      </div>
    )
  }

  if (caps.shell === 'senior') {
    return (
      <div className="stack">
        <div className="pm-hero shell-senior">
          <p className="eyebrow">Senior Summary</p>
          <h2>Theo dõi & Review</h2>
          <p className="muted">Bạn xem tiến độ ship và duyệt Review Requests. Không quản lý Users / Excel.</p>
        </div>
        <div className="pm-panel">
          <p>
            Ship: <strong>{currentProject?.ship_id || '—'}</strong>
          </p>
          <p className="muted">Dùng Dashboard cho overview; Review Requests để approve/reject.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="pm-hero shell-manager">
        <p className="eyebrow">Manager Summary</p>
        <h2>Tổng quan nhiều project</h2>
        <p className="muted">Full control: New/Load project, Excel (pha 2), Users, Review.</p>
      </div>
      <div className="pm-panel">
        <p>
          Ship đang mở: <strong>{currentProject?.ship_id || '—'}</strong>
        </p>
      </div>
    </div>
  )
}
