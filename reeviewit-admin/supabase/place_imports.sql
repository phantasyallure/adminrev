-- Bulk import from Google Maps scrape → Excel → admin review queue → publish.
--
-- Flow:
--   1. Admin uploads an .xlsx file in the admin panel. Rows are inserted here
--      as 'pending' — nothing on the live site changes yet.
--   2. Admin reviews/edits rows in the Import page, removes junk rows.
--   3. Admin hits Publish (one row or all): the photo is re-hosted into the
--      place-photos bucket via the import-place-photo Edge Function, a real
--      row is inserted into `places`, and this row is marked 'published'.
--
-- Run this after admin_schema.sql.

-- Google's own rating is informational only — it is NOT the same as
-- Reeviewit's review-based rating (computed live from the reviews table).
-- Shown as a "Google rating" label until the place earns real reviews.
alter table public.places
  add column if not exists google_rating numeric,
  add column if not exists google_rating_count integer;

create table if not exists public.place_imports (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text default 'restaurant',
  neighborhood text,
  address text,
  keywords text[] default '{}',
  google_maps_url text,
  google_rating numeric,
  google_rating_count integer,
  photo_url text,               -- original scraped image URL (external)
  hosted_photo_url text,        -- filled in once re-uploaded to our storage
  status text not null default 'pending', -- pending | published | skipped
  batch_label text,             -- e.g. filename, so imports can be told apart
  error text,                   -- last publish error, if any, shown in the UI
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  published_at timestamptz
);

alter table public.place_imports enable row level security;

drop policy if exists "content managers can read place_imports" on public.place_imports;
create policy "content managers can read place_imports"
  on public.place_imports for select
  using (public.has_admin_permission('can_manage_places'));

drop policy if exists "content managers can insert place_imports" on public.place_imports;
create policy "content managers can insert place_imports"
  on public.place_imports for insert
  with check (public.has_admin_permission('can_manage_places'));

drop policy if exists "content managers can update place_imports" on public.place_imports;
create policy "content managers can update place_imports"
  on public.place_imports for update
  using (public.has_admin_permission('can_manage_places'));

drop policy if exists "content managers can delete place_imports" on public.place_imports;
create policy "content managers can delete place_imports"
  on public.place_imports for delete
  using (public.has_admin_permission('can_manage_places'));

create index if not exists place_imports_status_idx on public.place_imports (status, created_at);
