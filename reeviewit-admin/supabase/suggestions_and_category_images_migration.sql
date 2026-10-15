-- Reeviewit — "Suggest a place" (site) + "Category images" (admin) migration
-- Run this in the SAME Supabase project as schema.sql / admin_schema.sql,
-- AFTER admin_schema.sql (it uses public.is_admin() / has_admin_permission()).
-- Idempotent / additive — safe to re-run.

-- ============================================================
-- 1. Place suggestions — "can't find a place" form on the site
-- ============================================================
-- Table already exists by hand in some projects (the admin panel's
-- Suggestions page was built first) — this creates it if missing and adds
-- the photo_url column either way, so it's safe regardless of history.
create table if not exists public.place_suggestions (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  category text,
  neighborhood text,
  address text,
  lat double precision,
  lng double precision,
  note text,
  submitted_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'dismissed')),
  created_at timestamptz not null default now()
);

-- Defensive ALTERs: the table may already exist (from earlier manual setup)
-- without these columns, since the admin UI didn't display them before.
alter table public.place_suggestions
  add column if not exists category text,
  add column if not exists photo_url text,
  add column if not exists lat double precision,
  add column if not exists lng double precision;

alter table public.place_suggestions enable row level security;

drop policy if exists "users can submit place suggestions" on public.place_suggestions;
create policy "users can submit place suggestions"
  on public.place_suggestions for insert
  with check (auth.uid() = submitted_by);

drop policy if exists "users can view their own suggestions" on public.place_suggestions;
create policy "users can view their own suggestions"
  on public.place_suggestions for select
  using (auth.uid() = submitted_by or public.has_admin_permission('can_manage_places'));

drop policy if exists "content managers can update suggestions" on public.place_suggestions;
create policy "content managers can update suggestions"
  on public.place_suggestions for update
  using (public.has_admin_permission('can_manage_places'));

drop policy if exists "content managers can delete suggestions" on public.place_suggestions;
create policy "content managers can delete suggestions"
  on public.place_suggestions for delete
  using (public.has_admin_permission('can_manage_places'));

-- Storage bucket for suggestion photos. Public read (so the admin panel and
-- any future public display can show them); upload restricted to a user's
-- own folder, same convention as review-photos. Path: {user_id}/{file}.
insert into storage.buckets (id, name, public)
values ('place-suggestions', 'place-suggestions', true)
on conflict (id) do nothing;

drop policy if exists "suggestion photos are publicly readable" on storage.objects;
create policy "suggestion photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'place-suggestions');

drop policy if exists "users can upload their own suggestion photos" on storage.objects;
create policy "users can upload their own suggestion photos"
  on storage.objects for insert
  with check (bucket_id = 'place-suggestions' and auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================
-- 2. Category images — admin-uploaded photos for the homepage's
--    Restaurant / Cafétéria / Pâtisserie tiles (previously required
--    manually dropping a file into /public — now uploadable from Admin).
-- ============================================================
create table if not exists public.category_images (
  category text primary key,
  image_url text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.category_images enable row level security;

drop policy if exists "category images are readable by everyone" on public.category_images;
create policy "category images are readable by everyone"
  on public.category_images for select using (true);

drop policy if exists "content managers can upsert category images" on public.category_images;
create policy "content managers can upsert category images"
  on public.category_images for insert
  with check (public.has_admin_permission('can_manage_places'));

drop policy if exists "content managers can update category images" on public.category_images;
create policy "content managers can update category images"
  on public.category_images for update
  using (public.has_admin_permission('can_manage_places'));

drop policy if exists "content managers can delete category images" on public.category_images;
create policy "content managers can delete category images"
  on public.category_images for delete
  using (public.has_admin_permission('can_manage_places'));

-- Storage bucket for category tile photos.
insert into storage.buckets (id, name, public)
values ('category-images', 'category-images', true)
on conflict (id) do nothing;

drop policy if exists "category tile photos are publicly readable" on storage.objects;
create policy "category tile photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'category-images');

drop policy if exists "content managers can upload category tile photos" on storage.objects;
create policy "content managers can upload category tile photos"
  on storage.objects for insert
  with check (bucket_id = 'category-images' and public.has_admin_permission('can_manage_places'));

drop policy if exists "content managers can update category tile photos" on storage.objects;
create policy "content managers can update category tile photos"
  on storage.objects for update
  using (bucket_id = 'category-images' and public.has_admin_permission('can_manage_places'));

-- ============================================================
-- 3. Place photo submissions — the "Add a real photo" button shown on
--    cards that are currently using the category placeholder photo
--    (i.e. the place has no cover_image_url of its own yet). Mirrors
--    place_suggestions: goes to Admin for review, nothing replaces the
--    live cover photo automatically.
-- ============================================================
create table if not exists public.place_photo_submissions (
  id uuid primary key default uuid_generate_v4(),
  place_id uuid not null references public.places(id) on delete cascade,
  photo_url text not null,
  submitted_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'dismissed')),
  created_at timestamptz not null default now()
);

alter table public.place_photo_submissions enable row level security;

drop policy if exists "users can submit place photos" on public.place_photo_submissions;
create policy "users can submit place photos"
  on public.place_photo_submissions for insert
  with check (auth.uid() = submitted_by);

drop policy if exists "users can view their own photo submissions" on public.place_photo_submissions;
create policy "users can view their own photo submissions"
  on public.place_photo_submissions for select
  using (auth.uid() = submitted_by or public.has_admin_permission('can_manage_places'));

drop policy if exists "content managers can update photo submissions" on public.place_photo_submissions;
create policy "content managers can update photo submissions"
  on public.place_photo_submissions for update
  using (public.has_admin_permission('can_manage_places'));

drop policy if exists "content managers can delete photo submissions" on public.place_photo_submissions;
create policy "content managers can delete photo submissions"
  on public.place_photo_submissions for delete
  using (public.has_admin_permission('can_manage_places'));

-- Storage bucket for submitted photos. Public read (so the admin panel can
-- preview them before approving), upload restricted to a user's own
-- folder — same convention as place-suggestions and review-photos.
insert into storage.buckets (id, name, public)
values ('place-photo-submissions', 'place-photo-submissions', true)
on conflict (id) do nothing;

drop policy if exists "submitted place photos are publicly readable" on storage.objects;
create policy "submitted place photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'place-photo-submissions');

drop policy if exists "users can upload their own place photo submissions" on storage.objects;
create policy "users can upload their own place photo submissions"
  on storage.objects for insert
  with check (bucket_id = 'place-photo-submissions' and auth.uid()::text = (storage.foldername(name))[1]);
