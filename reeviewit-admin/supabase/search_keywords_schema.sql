-- Reeviewit — search keywords migration
-- Run this in the SAME Supabase project as the main schema + admin_schema
-- (Supabase SQL editor). Additive / non-destructive.
--
-- What this adds:
--   1. `search_keywords` — admin-managed synonyms, e.g. "burger" -> fast-food,
--      "cake" / "gateau" -> patisserie. Lets a generic word surface every
--      place in that category, not just places whose name/keywords literally
--      contain the word.
--   2. `search_places_by_term(...)` — the function the live site calls to
--      search. It matches, in one pass:
--        - place name       (ilike, partial)
--        - places.keywords  (per-place dish/vibe tags, already used by
--                             Admin → Places, just wasn't wired into search)
--        - search_keywords  (the new category synonyms below)
--      Sorting by review count happens in the frontend after this returns,
--      since that lives in the place_ratings view.

-- ============================================================
-- 1. search_keywords table
-- ============================================================
create table if not exists public.search_keywords (
  id uuid primary key default uuid_generate_v4(),
  keyword text not null,
  category text not null check (category in ('restaurant', 'cafeteria', 'fast-food', 'patisserie')),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

-- Case-insensitive de-dupe: "Burger" and "burger" -> same row.
create unique index if not exists search_keywords_keyword_category_idx
  on public.search_keywords (lower(keyword), category);

alter table public.search_keywords enable row level security;

drop policy if exists "search keywords are readable by everyone" on public.search_keywords;
create policy "search keywords are readable by everyone"
  on public.search_keywords for select using (true);

drop policy if exists "content managers can add search keywords" on public.search_keywords;
create policy "content managers can add search keywords"
  on public.search_keywords for insert
  with check (public.has_admin_permission('can_manage_places'));

drop policy if exists "content managers can delete search keywords" on public.search_keywords;
create policy "content managers can delete search keywords"
  on public.search_keywords for delete
  using (public.has_admin_permission('can_manage_places'));

-- ============================================================
-- 2. Live search function
-- ============================================================
-- search_term: what the visitor typed (nullable/blank = no text filter).
-- category_filter / neighborhood_filter: the existing dropdown filters on
-- the search page — kept here so the whole query stays server-side.
create or replace function public.search_places_by_term(
  search_term text default null,
  category_filter text default null,
  neighborhood_filter text default null
)
returns setof public.places
language sql
stable
as $$
  select distinct p.*
  from public.places p
  where
    (
      search_term is null or btrim(search_term) = ''
      or p.name ilike '%' || search_term || '%'
      or exists (
        select 1 from unnest(p.keywords) as kw
        where kw ilike '%' || search_term || '%'
      )
      or p.category in (
        select sk.category
        from public.search_keywords sk
        where sk.keyword ilike '%' || search_term || '%'
           or search_term ilike '%' || sk.keyword || '%'
      )
    )
    and (category_filter is null or category_filter = '' or p.category = category_filter)
    and (neighborhood_filter is null or neighborhood_filter = '' or p.neighborhood = neighborhood_filter);
$$;

grant execute on function public.search_places_by_term(text, text, text) to anon, authenticated;

-- ============================================================
-- 3. Example rows — safe to delete/edit from Admin → Keywords afterwards
-- ============================================================
insert into public.search_keywords (keyword, category) values
  ('burger', 'fast-food'),
  ('tacos', 'fast-food'),
  ('pizza', 'fast-food'),
  ('cake', 'patisserie'),
  ('gateau', 'patisserie'),
  ('coffee', 'cafeteria'),
  ('cafe', 'cafeteria')
on conflict do nothing;
