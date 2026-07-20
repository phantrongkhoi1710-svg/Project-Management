-- Progress Management: roles + ship projects + sections + tasks
-- Chạy trong Supabase SQL Editor SAU khi đã chạy 001_init.sql

-- ========== Profiles / roles ==========
alter table public.profiles add column if not exists position text;
alter table public.profiles add column if not exists theme_color text;

-- Chuẩn hóa position từ metadata nếu còn trống
update public.profiles p
set
  position = coalesce(
    nullif(trim(p.position), ''),
    nullif(trim(u.raw_user_meta_data->>'position'), ''),
    'Engineer'
  ),
  display_name = coalesce(nullif(trim(p.display_name), ''), u.raw_user_meta_data->>'full_name', p.email),
  employee_id = coalesce(p.employee_id, u.raw_user_meta_data->>'employee_id'),
  theme_color = coalesce(p.theme_color, u.raw_user_meta_data->>'theme_color')
from auth.users u
where u.id = p.id;

-- Helper: role của user hiện tại
create or replace function public.current_position()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(
    (select position from public.profiles where id = auth.uid()),
    'engineer'
  ));
$$;

create or replace function public.is_manager_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_position() in ('manager', 'admin');
$$;

create or replace function public.is_senior_or_above()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_position() in ('manager', 'admin', 'senior');
$$;

-- ========== Projects (ship) ==========
alter table public.projects add column if not exists ship_id text;
alter table public.projects add column if not exists department text default 'Piping';
alter table public.projects add column if not exists start_date date;
alter table public.projects add column if not exists end_date date;
alter table public.projects add column if not exists ship_leader_id uuid references public.profiles (id);

-- name có thể dùng ship_id; backfill
update public.projects
set ship_id = coalesce(nullif(ship_id, ''), name)
where ship_id is null or ship_id = '';

-- ========== Sections ==========
create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  header_name text not null,
  sort_order int not null default 0,
  created_at timestamptz default now(),
  unique (project_id, header_name)
);

create index if not exists sections_project_id_idx on public.sections (project_id);

-- ========== Tasks (progress fields) ==========
alter table public.tasks add column if not exists section_id uuid references public.sections (id) on delete cascade;
alter table public.tasks add column if not exists zone text;
alter table public.tasks add column if not exists activity text;
alter table public.tasks add column if not exists drawing_id text;
alter table public.tasks add column if not exists start_date date;
alter table public.tasks add column if not exists finish_date date;
alter table public.tasks add column if not exists late_date date;
alter table public.tasks add column if not exists percent_complete numeric(5,2) default 0;
alter table public.tasks add column if not exists pending_review boolean default false;
alter table public.tasks add column if not exists review_requested_by uuid references public.profiles (id);
alter table public.tasks add column if not exists review_requested_at timestamptz;
alter table public.tasks add column if not exists review_link text;
alter table public.tasks add column if not exists rejection_comment text;
alter table public.tasks add column if not exists vvt_review text;
alter table public.tasks add column if not exists owners_review text;
alter table public.tasks add column if not exists comments text;

-- Map title -> activity nếu chưa có
update public.tasks
set activity = coalesce(nullif(activity, ''), title)
where activity is null or activity = '';

-- Status values: Not Started | In Progress | Completed | On Hold
-- (giữ text tự do; app sẽ dùng các giá trị này)

create index if not exists tasks_section_id_idx on public.tasks (section_id);
create index if not exists tasks_assignee_id_idx on public.tasks (assignee_id);
create index if not exists tasks_pending_review_idx on public.tasks (pending_review);

-- ========== RLS updates ==========
alter table public.sections enable row level security;

drop policy if exists "sections_select_authenticated" on public.sections;
create policy "sections_select_authenticated"
  on public.sections for select
  to authenticated
  using (true);

drop policy if exists "sections_write_manager" on public.sections;
create policy "sections_write_manager"
  on public.sections for all
  to authenticated
  using (
    public.is_manager_or_admin()
    or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
  )
  with check (
    public.is_manager_or_admin()
    or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
  );

-- Managers see all projects; others also can list (desktop-style shared ship data)
drop policy if exists "projects_select_member" on public.projects;
create policy "projects_select_member"
  on public.projects for select
  to authenticated
  using (true);

drop policy if exists "projects_insert_authenticated" on public.projects;
create policy "projects_insert_authenticated"
  on public.projects for insert
  to authenticated
  with check (owner_id = auth.uid() and public.is_manager_or_admin());

-- Tasks: everyone can read; write by role / assignee
drop policy if exists "tasks_select_member" on public.tasks;
create policy "tasks_select_member"
  on public.tasks for select
  to authenticated
  using (true);

drop policy if exists "tasks_insert_member" on public.tasks;
create policy "tasks_insert_member"
  on public.tasks for insert
  to authenticated
  with check (
    public.is_manager_or_admin()
    or public.is_senior_or_above()
  );

drop policy if exists "tasks_update_member" on public.tasks;
create policy "tasks_update_member"
  on public.tasks for update
  to authenticated
  using (
    public.is_manager_or_admin()
    or public.is_senior_or_above()
    or assignee_id = auth.uid()
  )
  with check (
    public.is_manager_or_admin()
    or public.is_senior_or_above()
    or assignee_id = auth.uid()
  );

-- Members: managers can add anyone; for create project auto-add owner
drop policy if exists "members_insert_owner_or_self" on public.project_members;
create policy "members_insert_owner_or_self"
  on public.project_members for insert
  to authenticated
  with check (
    public.is_manager_or_admin()
    or user_id = auth.uid()
    or exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
