-- Puts every place back into the site's own categories:
--   restaurant | cafeteria | fast-food | patisserie
-- The bulk import saved Google's wording ("Pizza restaurant", "Coffee shop",
-- "Pastry shop"...) as the category, which is why the site suddenly had dozens.
--
-- Safe to run more than once. Every old category is saved first in
-- places_category_backup, so it can be undone (see the bottom of this file).
-- Run it once in the Supabase SQL editor.

begin;

-- 1. Backup (only the places that will change; never overwritten on re-runs)
create table if not exists public.places_category_backup as
  select id, category, now() as backed_up_at from public.places where false;
alter table public.places_category_backup enable row level security;  -- no policies = private

-- 2. Mapping rules (kept identical to the admin app and the website)
create or replace function public.canonical_category(raw text)
returns text language sql immutable as $$
  with c as (
    select lower(translate(coalesce(raw, ''), 'éèêëàâäîïôöùûüç', 'eeeeaaaiioouuuc')) as v
  )
  select case
    when v in ('restaurant', 'cafeteria', 'fast-food', 'patisserie') then v
    when v ~ '(pastr|bakery|patisser|cake|dessert|candy|confection|chocolat|sweet|sundae|ice cream|creperie|crepe|donut|gateau|boulang)' then 'patisserie'
    when v ~ '(fast food|burger|sandwich|snack|taco|takeaway|take away|kebab|shawarma|doner|chicken shop|hot dog|fried chicken|panini)' then 'fast-food'
    when v ~ '(\ycafe\y|cafeteria|coffee|tea ?house|teahouse|tea room|espresso|juice|salon de the)' then 'cafeteria'
    else 'restaurant'
  end
  from c;
$$;

-- 3. Save the old values, then change them
insert into public.places_category_backup (id, category)
select p.id, p.category
from public.places p
where p.category is distinct from public.canonical_category(p.category)
  and not exists (select 1 from public.places_category_backup b where b.id = p.id);

update public.places
   set category = public.canonical_category(category)
 where category is distinct from public.canonical_category(category);

-- Places still waiting in the Import queue get the same treatment,
-- so publishing them later doesn't bring the long list back.
update public.place_imports
   set category = public.canonical_category(category)
 where status = 'pending'
   and category is distinct from public.canonical_category(category);

drop function public.canonical_category(text);

commit;

-- Check: should list just the four categories.
select category, count(*) from public.places group by category order by 2 desc;

-- UNDO (only if you need to go back):
--   update public.places p set category = b.category
--     from public.places_category_backup b where b.id = p.id;
