-- Reeviewit Admin — additive migration
-- Run this in the SAME Supabase project as the main Reeviewit site
-- (Supabase SQL editor, after the main schema.sql has already run).
-- Everything here is additive / non-destructive to the existing site.

-- ============================================================
-- 1. Review moderation
-- ============================================================
alter table public.reviews
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  add column if not exists moderated_by uuid references public.profiles(id) on delete set null,
  add column if not exists moderated_at timestamptz;

-- Reviews that already existed before this migration are live on the
-- site today — grandfather them in as approved so nothing disappears.
update public.reviews set status = 'approved' where status = 'pending';

-- ============================================================
-- 2. Place search keywords (for "search by dish" etc.)
-- ============================================================
alter table public.places
  add column if not exists keywords text[] not null default '{}',
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists google_maps_url text;

-- ============================================================
-- 3. User bans
-- ============================================================
alter table public.profiles
  add column if not exists is_banned boolean not null default false,
  add column if not exists banned_reason text,
  add column if not exists banned_at timestamptz,
  add column if not exists is_deleted boolean not null default false;

-- ============================================================
-- 4. Badges
-- ============================================================
create table if not exists public.badges (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  icon text not null default '🏆',   -- emoji or short label
  color text not null default '#e4634a',
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_badges (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  awarded_by uuid references public.profiles(id) on delete set null,
  awarded_at timestamptz not null default now(),
  unique (user_id, badge_id)
);

-- Convenience view: review counts per user, for the "most reviews" badge candidate list.
create or replace view public.user_review_counts as
select
  p.id as user_id,
  p.display_name,
  count(r.id) as review_count
from public.profiles p
left join public.reviews r on r.author_id = p.id and r.status = 'approved'
group by p.id, p.display_name;

-- ============================================================
-- 5. Admin roles & permissions
-- ============================================================
create table if not exists public.admin_users (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role_label text not null default 'Moderator',
  can_approve_reviews boolean not null default false,
  can_delete_reviews boolean not null default false,
  can_manage_places boolean not null default false,
  can_ban_users boolean not null default false,
  can_delete_users boolean not null default false,
  can_award_badges boolean not null default false,
  can_manage_roles boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

-- Security-definer helpers so RLS policies can check permissions without
-- recursive-RLS issues on admin_users itself.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

create or replace function public.has_admin_permission(perm text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  result boolean;
begin
  execute format(
    'select %I from public.admin_users where user_id = $1', perm
  ) into result using auth.uid();
  return coalesce(result, false);
end;
$$;

-- ============================================================
-- 6. RLS policies
-- ============================================================
alter table public.admin_users enable row level security;
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;

-- admin_users: any admin can see the team roster; only someone with
-- can_manage_roles can add/edit/remove admins.
drop policy if exists "admins can view admin roster" on public.admin_users;
create policy "admins can view admin roster"
  on public.admin_users for select
  using (public.is_admin());

drop policy if exists "role managers can add admins" on public.admin_users;
create policy "role managers can add admins"
  on public.admin_users for insert
  with check (public.has_admin_permission('can_manage_roles'));

drop policy if exists "role managers can edit admins" on public.admin_users;
create policy "role managers can edit admins"
  on public.admin_users for update
  using (public.has_admin_permission('can_manage_roles'));

drop policy if exists "role managers can remove admins" on public.admin_users;
create policy "role managers can remove admins"
  on public.admin_users for delete
  using (public.has_admin_permission('can_manage_roles'));

-- reviews: moderators can update status; deleters can delete.
drop policy if exists "moderators can update review status" on public.reviews;
create policy "moderators can update review status"
  on public.reviews for update
  using (public.has_admin_permission('can_approve_reviews') or public.has_admin_permission('can_delete_reviews'));

drop policy if exists "moderators can delete reviews" on public.reviews;
create policy "moderators can delete reviews"
  on public.reviews for delete
  using (public.has_admin_permission('can_delete_reviews'));

-- Public site should only ever see approved reviews from anonymous/public
-- reads. Authors can still see their own pending/rejected reviews.
drop policy if exists "reviews are readable by everyone" on public.reviews;
create policy "approved reviews are readable by everyone"
  on public.reviews for select
  using (status = 'approved' or author_id = auth.uid() or public.is_admin());

-- places: content managers can insert/update/delete.
drop policy if exists "content managers can insert places" on public.places;
create policy "content managers can insert places"
  on public.places for insert
  with check (public.has_admin_permission('can_manage_places'));

drop policy if exists "content managers can update places" on public.places;
create policy "content managers can update places"
  on public.places for update
  using (public.has_admin_permission('can_manage_places'));

drop policy if exists "content managers can delete places" on public.places;
create policy "content managers can delete places"
  on public.places for delete
  using (public.has_admin_permission('can_manage_places'));

-- profiles: community managers can ban / soft-delete users.
drop policy if exists "community managers can moderate profiles" on public.profiles;
create policy "community managers can moderate profiles"
  on public.profiles for update
  using (
    auth.uid() = id
    or public.has_admin_permission('can_ban_users')
    or public.has_admin_permission('can_delete_users')
  );

-- badges: readable by everyone (shown on public profiles), managed by
-- people with can_award_badges.
drop policy if exists "badges are readable by everyone" on public.badges;
create policy "badges are readable by everyone"
  on public.badges for select using (true);

drop policy if exists "badge managers can create badges" on public.badges;
create policy "badge managers can create badges"
  on public.badges for insert
  with check (public.has_admin_permission('can_award_badges'));

drop policy if exists "badge managers can edit badges" on public.badges;
create policy "badge managers can edit badges"
  on public.badges for update
  using (public.has_admin_permission('can_award_badges'));

drop policy if exists "badge managers can delete badges" on public.badges;
create policy "badge managers can delete badges"
  on public.badges for delete
  using (public.has_admin_permission('can_award_badges'));

drop policy if exists "user badges are readable by everyone" on public.user_badges;
create policy "user badges are readable by everyone"
  on public.user_badges for select using (true);

drop policy if exists "badge managers can award badges" on public.user_badges;
create policy "badge managers can award badges"
  on public.user_badges for insert
  with check (public.has_admin_permission('can_award_badges'));

drop policy if exists "badge managers can revoke badges" on public.user_badges;
create policy "badge managers can revoke badges"
  on public.user_badges for delete
  using (public.has_admin_permission('can_award_badges'));

-- Storage bucket for place cover photos uploaded from the admin panel.
insert into storage.buckets (id, name, public)
values ('place-photos', 'place-photos', true)
on conflict (id) do nothing;

drop policy if exists "place photos are publicly readable" on storage.objects;
create policy "place photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'place-photos');

drop policy if exists "content managers can upload place photos" on storage.objects;
create policy "content managers can upload place photos"
  on storage.objects for insert
  with check (bucket_id = 'place-photos' and public.has_admin_permission('can_manage_places'));

drop policy if exists "content managers can update place photos" on storage.objects;
create policy "content managers can update place photos"
  on storage.objects for update
  using (bucket_id = 'place-photos' and public.has_admin_permission('can_manage_places'));

-- ============================================================
-- 7. Bootstrap: make yourself the first Owner
-- ============================================================
-- Run this LAST, once, after you've signed up on the main site with the
-- account you want to use to log into the admin panel. Replace the email.
--
-- insert into public.admin_users
--   (user_id, role_label, can_approve_reviews, can_delete_reviews, can_manage_places,
--    can_ban_users, can_delete_users, can_award_badges, can_manage_roles)
-- select id, 'Owner', true, true, true, true, true, true, true
-- from public.profiles
-- where id = (select id from auth.users where email = 'you@example.com');
