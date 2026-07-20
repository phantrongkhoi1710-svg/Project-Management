-- Project Manager schema + RLS
-- Chạy trong Supabase SQL Editor

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  employee_id text,
  position text,
  theme_color text,
  created_at timestamptz default now()
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists employee_id text;
alter table public.profiles add column if not exists position text;
alter table public.profiles add column if not exists theme_color text;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner_id uuid not null references public.profiles (id),
  status text not null default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo',
  assignee_id uuid references public.profiles (id),
  due_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member',
  primary key (project_id, user_id)
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, employee_id, position, theme_color)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'employee_id',
    new.raw_user_meta_data->>'position',
    new.raw_user_meta_data->>'theme_color'
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    employee_id = coalesce(excluded.employee_id, public.profiles.employee_id),
    position = coalesce(excluded.position, public.profiles.position),
    theme_color = coalesce(excluded.theme_color, public.profiles.theme_color);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: membership check
create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
  );
$$;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.project_members enable row level security;

-- profiles
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- projects
drop policy if exists "projects_select_member" on public.projects;
create policy "projects_select_member"
  on public.projects for select
  to authenticated
  using (public.is_project_member(id) or owner_id = auth.uid());

drop policy if exists "projects_insert_authenticated" on public.projects;
create policy "projects_insert_authenticated"
  on public.projects for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "projects_update_member" on public.projects;
create policy "projects_update_member"
  on public.projects for update
  to authenticated
  using (public.is_project_member(id) or owner_id = auth.uid())
  with check (public.is_project_member(id) or owner_id = auth.uid());

drop policy if exists "projects_delete_owner" on public.projects;
create policy "projects_delete_owner"
  on public.projects for delete
  to authenticated
  using (owner_id = auth.uid());

-- project_members
drop policy if exists "members_select_member" on public.project_members;
create policy "members_select_member"
  on public.project_members for select
  to authenticated
  using (public.is_project_member(project_id) or user_id = auth.uid());

drop policy if exists "members_insert_owner_or_self" on public.project_members;
create policy "members_insert_owner_or_self"
  on public.project_members for insert
  to authenticated
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = auth.uid()
    )
  );

drop policy if exists "members_delete_owner" on public.project_members;
create policy "members_delete_owner"
  on public.project_members for delete
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = auth.uid()
    )
  );

-- tasks
drop policy if exists "tasks_select_member" on public.tasks;
create policy "tasks_select_member"
  on public.tasks for select
  to authenticated
  using (public.is_project_member(project_id));

drop policy if exists "tasks_insert_member" on public.tasks;
create policy "tasks_insert_member"
  on public.tasks for insert
  to authenticated
  with check (public.is_project_member(project_id));

drop policy if exists "tasks_update_member" on public.tasks;
create policy "tasks_update_member"
  on public.tasks for update
  to authenticated
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

drop policy if exists "tasks_delete_member" on public.tasks;
create policy "tasks_delete_member"
  on public.tasks for delete
  to authenticated
  using (public.is_project_member(project_id));

-- Backfill profiles for existing auth users (nếu đã import trước trigger)
insert into public.profiles (id, email, display_name, employee_id, position, theme_color)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', u.email),
  u.raw_user_meta_data->>'employee_id',
  u.raw_user_meta_data->>'position',
  u.raw_user_meta_data->>'theme_color'
from auth.users u
on conflict (id) do update set
  email = excluded.email,
  display_name = coalesce(excluded.display_name, public.profiles.display_name),
  employee_id = coalesce(excluded.employee_id, public.profiles.employee_id),
  position = coalesce(excluded.position, public.profiles.position),
  theme_color = coalesce(excluded.theme_color, public.profiles.theme_color);
