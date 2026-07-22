-- Managers/admins can delete any project (cascade tasks/sections)
drop policy if exists "projects_delete_owner" on public.projects;
drop policy if exists "projects_delete_manager_or_owner" on public.projects;
create policy "projects_delete_manager_or_owner"
  on public.projects for delete
  to authenticated
  using (owner_id = auth.uid() or public.is_manager_or_admin());
