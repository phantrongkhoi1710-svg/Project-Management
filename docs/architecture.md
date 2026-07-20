# Architecture

## Stack

- Frontend: React + Vite (SPA), hosted on GitHub Pages
- Backend: Supabase only (Auth email/password + Postgres + RLS)
- No C# API in this phase

## Data flow

```mermaid
flowchart TB
  subgraph pages [GitHub_Pages]
    ReactApp[React_Vite_SPA]
  end
  subgraph supabase [Supabase]
    Auth[Auth_EmailPassword]
    DB[(Postgres_RLS)]
  end
  ReactApp -->|"signIn / session"| Auth
  ReactApp -->|"CRUD projects tasks"| DB
  Auth -->|"user id"| DB
```

## Folder layout

```
.
├── database.json
├── docs/architecture.md
├── scripts/import-users.ps1
├── supabase/migrations/
├── web/                 # React app
└── .github/workflows/
```

## Security notes

- Frontend uses only the anon/publishable key
- Row Level Security enforces who can read/write projects and tasks
- Users are provisioned via admin import script (no public signup in MVP)
