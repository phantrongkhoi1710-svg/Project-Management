-- Engineering Plans import fields
alter table public.tasks add column if not exists external_activity_id text;
alter table public.tasks add column if not exists resource text;
alter table public.tasks add column if not exists wbs_path text;

create unique index if not exists tasks_project_external_activity_uidx
  on public.tasks (project_id, external_activity_id)
  where external_activity_id is not null and external_activity_id <> '';

create index if not exists tasks_drawing_id_idx on public.tasks (drawing_id);
create index if not exists tasks_resource_idx on public.tasks (resource);
