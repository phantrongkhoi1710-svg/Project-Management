import { useEffect, useMemo, useRef, useState } from 'react'

function empSortKey(id) {
  if (id != null && /^\d+$/.test(String(id))) return Number(id)
  return Number.MAX_SAFE_INTEGER
}

export function EmailPicker({ users, value, onChange, required }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef(null)
  const inputRef = useRef(null)

  const sorted = useMemo(() => {
    return [...users].sort((a, b) => {
      const d = empSortKey(a.employeeId) - empSortKey(b.employeeId)
      if (d !== 0) return d
      return String(a.email).localeCompare(String(b.email))
    })
  }, [users])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter((u) => {
      const hay = `${u.employeeId || ''} ${u.name || ''} ${u.email || ''} ${u.position || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [sorted, query])

  const selected = sorted.find((u) => u.email === value)

  useEffect(() => {
    function onDoc(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function pick(user) {
    onChange(user.email)
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="email-picker" ref={rootRef}>
      <button
        type="button"
        className={`email-picker-trigger ${open ? 'open' : ''}`}
        onClick={() => {
          setOpen((v) => !v)
          setTimeout(() => inputRef.current?.focus(), 0)
        }}
      >
        {selected ? (
          <span className="email-picker-selected">
            <strong>{selected.employeeId ? `#${selected.employeeId}` : '—'}</strong>
            <span>
              {selected.name}
              <em>{selected.email}</em>
            </span>
          </span>
        ) : (
          <span className="muted">Chọn nhân viên / gmail…</span>
        )}
        <span className="email-picker-caret">{open ? '▲' : '▼'}</span>
      </button>

      {/* native required support */}
      <input type="email" value={value} required={required} readOnly tabIndex={-1} className="email-picker-hidden" />

      {open && (
        <div className="email-picker-dropdown">
          <input
            ref={inputRef}
            className="email-picker-search"
            type="search"
            placeholder="Tìm theo mã NV, tên, email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          <ul className="email-picker-list" role="listbox">
            {filtered.length === 0 ? (
              <li className="email-picker-empty">Không tìm thấy</li>
            ) : (
              filtered.map((u) => (
                <li key={u.email}>
                  <button
                    type="button"
                    className={u.email === value ? 'active' : ''}
                    onClick={() => pick(u)}
                  >
                    <span className="emp-id">{u.employeeId || '—'}</span>
                    <span className="emp-meta">
                      <strong>{u.name}</strong>
                      <em>{u.email}</em>
                    </span>
                    <span className="emp-pos">{u.position}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
