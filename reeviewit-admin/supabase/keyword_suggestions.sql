-- AI-suggested search keywords, reviewed before being added to a place.
--
-- Flow:
--   1. Admin hits "Scan all places" (or scans one place) in the Keyword
--      Suggestions page. The suggest-keywords Edge Function looks at the
--      place's name/category/existing keywords AND its cover photo, and
--      proposes additional "vibe" keywords (e.g. "date spot", "authentic",
--      "calm", "family friendly") that help search matching beyond the
--      handful of keywords entered when the place was first added.
--   2. Suggestions land here as 'pending' — nothing on the live place
--      changes yet.
--   3. Admin reviews each suggestion, unticks any that don't fit, and hits
--      Approve — approved keywords are merged (deduplicated) into the
--      place's real `keywords` array. Reject just discards the row.
--
-- Run this after admin_schema.sql and place_imports.sql.

create table if not exists public.keyword_suggestions (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  suggested_keywords text[] not null default '{}',
  model text,                    -- which model produced this, for later tuning
  status text not null default 'pending', -- pending | approved | rejected
  error text,                    -- last scan error for this place, if any
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.keyword_suggestions enable row level security;

drop policy if exists "content managers can read keyword_suggestions" on public.keyword_suggestions;
create policy "content managers can read keyword_suggestions"
  on public.keyword_suggestions for select
  using (public.has_admin_permission('can_manage_places'));

drop policy if exists "content managers can insert keyword_suggestions" on public.keyword_suggestions;
create policy "content managers can insert keyword_suggestions"
  on public.keyword_suggestions for insert
  with check (public.has_admin_permission('can_manage_places'));

drop policy if exists "content managers can update keyword_suggestions" on public.keyword_suggestions;
create policy "content managers can update keyword_suggestions"
  on public.keyword_suggestions for update
  using (public.has_admin_permission('can_manage_places'));

drop policy if exists "content managers can delete keyword_suggestions" on public.keyword_suggestions;
create policy "content managers can delete keyword_suggestions"
  on public.keyword_suggestions for delete
  using (public.has_admin_permission('can_manage_places'));

create index if not exists keyword_suggestions_status_idx on public.keyword_suggestions (status, created_at);
-- One pending suggestion per place at a time — re-scanning a place with an
-- existing pending row updates it instead of piling up duplicates.
create unique index if not exists keyword_suggestions_place_pending_idx
  on public.keyword_suggestions (place_id) where status = 'pending';
