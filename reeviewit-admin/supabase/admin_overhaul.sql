-- Reeviewit / Rayyek — admin overhaul migration
-- Run ONCE in the Supabase SQL editor (same project as the main site).
-- Idempotent: safe to re-run. Needs admin_schema.sql to have been run before.

-- ============================================================
-- 1. Visitors: per-day stats (day boundaries = Algeria time)
-- ============================================================
alter table public.site_visits add column if not exists device_type text;
create index if not exists site_visits_created_at_idx on public.site_visits (created_at desc);

-- Visits per calendar day (Africa/Algiers) for the last p_days days.
-- Days with no traffic still come back with 0, so charts have no gaps.
create or replace function public.visitor_daily_counts(p_days int default 30)
returns table (day date, visits bigint, uniques bigint)
language sql stable security definer set search_path = public as $$
  with days as (
    select generate_series(
      (now() at time zone 'Africa/Algiers')::date - (greatest(p_days, 1) - 1),
      (now() at time zone 'Africa/Algiers')::date,
      interval '1 day')::date as day
  ), v as (
    select (created_at at time zone 'Africa/Algiers')::date as day,
           count(*) as visits,
           count(distinct ip_address) as uniques
    from public.site_visits
    where created_at >= ((now() at time zone 'Africa/Algiers')::date - (greatest(p_days, 1) - 1))::timestamp at time zone 'Africa/Algiers'
    group by 1
  )
  select d.day, coalesce(v.visits, 0), coalesce(v.uniques, 0)
  from days d left join v using (day)
  order by d.day;
$$;

-- Full breakdown of ONE day (country, device, hour, latest visits).
create or replace function public.visitor_day_summary(p_day date)
returns jsonb
language sql stable security definer set search_path = public as $$
  with d as (
    select * from public.site_visits
    where created_at >= p_day::timestamp at time zone 'Africa/Algiers'
      and created_at <  (p_day + 1)::timestamp at time zone 'Africa/Algiers'
  )
  select jsonb_build_object(
    'visits',  (select count(*) from d),
    'uniques', (select count(distinct ip_address) from d),
    'byCountry', coalesce((select jsonb_agg(jsonb_build_object('country', c, 'count', n) order by n desc)
                 from (select coalesce(country, 'Unknown') c, count(*) n from d group by 1) x), '[]'::jsonb),
    'byDevice',  coalesce((select jsonb_agg(jsonb_build_object('device', c, 'count', n) order by n desc)
                 from (select coalesce(device_type, 'unknown') c, count(*) n from d group by 1) x), '[]'::jsonb),
    'byHour',    coalesce((select jsonb_agg(jsonb_build_object('hour', h, 'count', n) order by h)
                 from (select extract(hour from created_at at time zone 'Africa/Algiers')::int h, count(*) n from d group by 1) x), '[]'::jsonb),
    'recent',    coalesce((select jsonb_agg(r) from (
                   select ip_address, country, city, path, device_type, created_at
                   from d order by created_at desc limit 25) r), '[]'::jsonb)
  );
$$;

create or replace function public.visitor_all_time()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total',   (select count(*) from public.site_visits),
    'uniques', (select count(distinct ip_address) from public.site_visits),
    'since',   (select min(created_at) from public.site_visits)
  );
$$;

-- Only the edge function (service role) may call these.
revoke all on function public.visitor_daily_counts(int) from public, anon, authenticated;
revoke all on function public.visitor_day_summary(date) from public, anon, authenticated;
revoke all on function public.visitor_all_time() from public, anon, authenticated;
grant execute on function public.visitor_daily_counts(int) to service_role;
grant execute on function public.visitor_day_summary(date) to service_role;
grant execute on function public.visitor_all_time() to service_role;

-- ============================================================
-- 2. Categories (managed from Admin → Places → Categories)
-- ============================================================
create table if not exists public.categories (
  key text primary key check (key ~ '^[a-z0-9-]+$'),
  label text not null,
  emoji text,
  sort_order int not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.categories (key, label, emoji, sort_order) values
  ('restaurant', 'Restaurant', '🍽️', 1),
  ('cafeteria',  'Cafeteria',  '☕', 2),
  ('fast-food',  'Fast food',  '🍔', 3),
  ('patisserie', 'Patisserie', '🥐', 4)
on conflict (key) do nothing;

alter table public.categories enable row level security;
drop policy if exists "categories are public" on public.categories;
create policy "categories are public" on public.categories for select using (true);
drop policy if exists "admins manage categories" on public.categories;
create policy "admins manage categories" on public.categories for all
  using (public.has_admin_permission('can_manage_places'))
  with check (public.has_admin_permission('can_manage_places'));

-- If places.category has a CHECK constraint listing the 4 old values,
-- drop it so new categories can be used (ignore the notice if none exists).
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.places'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%category%'
  loop
    execute format('alter table public.places drop constraint %I', c.conname);
  end loop;
end $$;

-- ============================================================
-- 3. Push notifications
-- ============================================================
alter table public.admin_users add column if not exists can_send_notifications boolean not null default false;
update public.admin_users set can_send_notifications = true where can_manage_roles = true;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('review_reply','review_approved','product_approved','suggestion_approved','photo_approved','announcement'));

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists "own subscriptions select" on public.push_subscriptions;
create policy "own subscriptions select" on public.push_subscriptions for select using (auth.uid() = user_id);
drop policy if exists "own subscriptions insert" on public.push_subscriptions;
create policy "own subscriptions insert" on public.push_subscriptions for insert with check (auth.uid() = user_id);
drop policy if exists "own subscriptions delete" on public.push_subscriptions;
create policy "own subscriptions delete" on public.push_subscriptions for delete using (auth.uid() = user_id);
drop policy if exists "own subscriptions update" on public.push_subscriptions;
create policy "own subscriptions update" on public.push_subscriptions for update using (auth.uid() = user_id);
drop policy if exists "admins count subscriptions" on public.push_subscriptions;
create policy "admins count subscriptions" on public.push_subscriptions for select using (public.is_admin());

create table if not exists public.push_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  link_path text,
  audience text not null default 'all',
  target_user_id uuid references auth.users(id) on delete set null,
  recipients int not null default 0,
  pushed int not null default 0,
  failed int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.push_campaigns enable row level security;
drop policy if exists "admins read campaigns" on public.push_campaigns;
create policy "admins read campaigns" on public.push_campaigns for select using (public.is_admin());
