const STORAGE_KEY = 'pm_build_id'

/**
 * Nếu server có bản build mới hơn bản đang chạy trong tab → reload 1 lần.
 * version.json luôn fetch với cache: 'no-store'.
 */
export async function checkDeployVersion() {
  if (import.meta.env.DEV) return

  try {
    const url = `${import.meta.env.BASE_URL}version.json?_=${Date.now()}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return
    const remote = await res.json()
    if (!remote?.id) return

    const prev = localStorage.getItem(STORAGE_KEY)
    localStorage.setItem(STORAGE_KEY, remote.id)

    // Bản JS đang chạy khác bản vừa deploy
    if (prev && prev !== remote.id) {
      const bust = `${window.location.pathname}${window.location.search}${window.location.hash}`
      window.location.replace(bust)
    }
  } catch {
    // bỏ qua nếu offline / chưa có version.json
  }
}
