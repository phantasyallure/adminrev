-- Fixes "Delete does nothing" on the Import page.
-- Run once in the Supabase SQL editor. Safe to run more than once.

alter table public.place_imports enable row level security;

drop policy if exists "content managers can delete place_imports" on public.place_imports;
create policy "content managers can delete place_imports"
  on public.place_imports for delete
  using (public.has_admin_permission('can_manage_places'));

-- Make sure the other import policies exist too.
drop policy if exists "content managers can read place_imports" on public.place_imports;
create policy "content managers can read place_imports"
  on public.place_imports for select
  using (public.has_admin_permission('can_manage_places'));

drop policy if exists "content managers can update place_imports" on public.place_imports;
create policy "content managers can update place_imports"
  on public.place_imports for update
  using (public.has_admin_permission('can_manage_places'));

drop policy if exists "content managers can insert place_imports" on public.place_imports;
create policy "content managers can insert place_imports"
  on public.place_imports for insert
  with check (public.has_admin_permission('can_manage_places'));
