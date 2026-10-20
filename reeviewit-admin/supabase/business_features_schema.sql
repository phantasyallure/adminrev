-- Reeviewit — business features migration
-- Run once in the Supabase SQL editor (same project as schema.sql +
-- admin_schema.sql + search_keywords_schema.sql). Additive / non-destructive.
--
-- What this adds:
--   1. places.cta_* / menu_* — an admin-controlled CTA button (Order / View
--      menu / Book a table) and a menu, both OFF by default per place.
--   2. business_claims — leads from the "Claim this business" form on the
--      live site. Admin-only visibility (Admin → Business Claims).
--   3. place_owners — who owns which place, granted by an admin after
--      payment. Purely presentational elsewhere: the site checks this to
--      decide whether to label someone "Owner of {place}" with a verified
--      badge — only when they're replying on THAT place's reviews.
--   4. update_own_menu() — lets a granted owner edit their OWN place's menu
--      (only once an admin has flipped menu_enabled on for that place),
--      without giving them any broader write access to the place row.

-- ============================================================
-- 1. CTA button + menu columns on places (admin-gated, off by default)
-- ============================================================
alter table public.places
  add column if not exists cta_enabled boolean not null default false,
  add column if not exists cta_label text check (cta_label in ('order', 'menu', 'booking')),
  add column if not exists cta_url text,
  add column if not exists menu_enabled boolean not null default false,
  add column if not exists menu_items jsonb not null default '[]'::jsonb;

-- ============================================================
-- 2. Claim-this-business leads
-- ============================================================
create table if not exists public.business_claims (
  id uuid primary key default uuid_generate_v4(),
  place_id uuid not null references public.places(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  phone text not null,
  user_id uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'contacted', 'approved', 'rejected')),
  admin_notes text,
  created_at timestamptz not null default now()
);

alter table public.business_claims enable row level security;

drop policy if exists "anyone can submit a claim" on public.business_claims;
create policy "anyone can submit a claim"
  on public.business_claims for insert
  with check (true);

drop policy if exists "content managers can view claims" on public.business_claims;
create policy "content managers can view claims"
  on public.business_claims for select
  using (public.has_admin_permission('can_manage_places'));

drop policy if exists "content managers can update claims" on public.business_claims;
create policy "content managers can update claims"
  on public.business_claims for update
  using (public.has_admin_permission('can_manage_places'));

drop policy if exists "content managers can delete claims" on public.business_claims;
create policy "content managers can delete claims"
  on public.business_claims for delete
  using (public.has_admin_permission('can_manage_places'));

-- ============================================================
-- 3. Business ownership — one owner per place.
-- ============================================================
create table if not exists public.place_owners (
  id uuid primary key default uuid_generate_v4(),
  place_id uuid not null unique references public.places(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles(id) on delete set null
);

alter table public.place_owners enable row level security;

drop policy if exists "ownership is publicly readable" on public.place_owners;
create policy "ownership is publicly readable"
  on public.place_owners for select using (true);

drop policy if exists "content managers can grant ownership" on public.place_owners;
create policy "content managers can grant ownership"
  on public.place_owners for insert
  with check (public.has_admin_permission('can_manage_places'));

drop policy if exists "content managers can revoke ownership" on public.place_owners;
create policy "content managers can revoke ownership"
  on public.place_owners for delete
  using (public.has_admin_permission('can_manage_places'));

-- ============================================================
-- 4. Owner self-serve menu editing
-- ============================================================
-- Scoped narrowly on purpose: only touches menu_items, only for a place the
-- caller actually owns, and only once an admin has turned menu_enabled on
-- for that specific place (the paid-feature gate) — the owner never gets a
-- broader UPDATE grant on places (can't touch cta_url, category, etc).
create or replace function public.update_own_menu(p_place_id uuid, p_items jsonb)
returns public.places
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.places;
begin
  if not exists (
    select 1 from public.place_owners
    where place_id = p_place_id and user_id = auth.uid()
  ) then
    raise exception 'not_owner';
  end if;

  if not exists (
    select 1 from public.places where id = p_place_id and menu_enabled = true
  ) then
    raise exception 'menu_not_enabled';
  end if;

  update public.places
  set menu_items = p_items
  where id = p_place_id
  returning * into result;

  return result;
end;
$$;

grant execute on function public.update_own_menu(uuid, jsonb) to authenticated;
