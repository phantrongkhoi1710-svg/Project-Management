-- Phase 2: managers can update profiles (user management)

drop policy if exists "profiles_update_manager" on public.profiles;
create policy "profiles_update_manager"
  on public.profiles for update
  to authenticated
  using (public.is_manager_or_admin())
  with check (public.is_manager_or_admin());
