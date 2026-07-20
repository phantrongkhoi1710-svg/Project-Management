# Project Manager

App quản lý dự án: **React (Vite)** + **Supabase** (Auth + Postgres), deploy **GitHub Pages**.

## Quick start

1. Chạy SQL [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql) trên Supabase SQL Editor.
2. Copy `web/.env.example` → `web/.env.local`, dán **anon** key.
3. Dev:

```bash
cd web
npm install
npm run dev
```

4. (Tuỳ chọn) Import users từ `database.json`:

```powershell
# Root .env cần SUPABASE_SERVICE_ROLE_KEY
.\scripts\import-users.ps1
```

Mật khẩu JSON `"01"` được map thành `Pass01`.

## Scripts

| Lệnh | Mô tả |
|------|--------|
| `npm run dev` | Dev server |
| `npm run build` | Build `web/dist` |
| `npm run preview` | Xem bản build |

## Deploy

Push lên `main` — workflow `.github/workflows/deploy-pages.yml` build và publish `web/dist`.

Với GitHub project site, set secret/env `VITE_BASE=/repo-name/`.
