# Reeviewit — Admin

A fully separate admin panel for [reeview.it](https://reeview.it). Same
Supabase project/database as the main site, its own codebase, its own
Vercel domain (e.g. `admin-reeviewit.vercel.app`), its own login gate.

## What it does

- **Reviews**: approve, reject, or delete reviews before/after they show on the site.
- **Places**: add/edit/delete restaurants & cafeterias — name, category, neighborhood,
  price range, cover photo, and free-text **keywords** (dishes, cuisine, vibe) so the
  main site's search can match on things like "couscous" or "rooftop".
- **Users**: ban / unban, delete (soft-delete anonymizes; true account deletion needs
  the optional Edge Function below), see review counts and badges.
- **Badges**: create badge types (name + emoji + color) and award them to users —
  a "most reviews" leaderboard is built in to help pick recipients.
- **Roles**: grant/revoke admin access to existing Reeviewit accounts, with
  per-person checkboxes for each permission (approve reviews, delete reviews,
  manage places, ban users, delete users, award badges, manage roles).

Login only works for accounts that have a row in `admin_users` — a normal
Reeviewit user account gets turned away even if the password is correct.

## 1. Run the database migration

In the Supabase SQL editor for the **same project** the main site uses, run
`supabase/admin_schema.sql`. It's additive — it doesn't touch existing data
except to mark currently-live reviews as `approved` so nothing disappears.

**Important — one small change needed on the main site:** the migration adds
a `status` column to `reviews` and changes the public read policy to only
show `status = 'approved'` reviews. New reviews now default to `pending`
until an admin approves them. If `src/lib/places.js` or `reviews.js` on the
main site query reviews directly with a service role or bypass RLS anywhere,
double check they don't need an explicit `.eq('status', 'approved')' filter
too — with the anon key, RLS handles it automatically.

## 2. Make yourself the first Owner

Sign up for a normal account on reeview.it with the email you want to use
to log into the admin panel. Then run the commented-out block at the bottom
of `admin_schema.sql` with that email — it gives you every permission,
including `can_manage_roles`, so you can add teammates from the Roles page
afterward without touching SQL again.

## 3. Configure and run locally

```bash
cp .env.example .env.local
# fill in the same VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY as the main site
npm install
npm run dev
```

## 4. Deploy to Vercel as its own project

1. Push this folder to its own GitHub repo (separate from `reeviewit`).
2. In Vercel: **New Project** → import that repo.
3. Add the same two environment variables (`VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`) in Vercel's project settings.
4. Deploy. You'll get an independent `*.vercel.app` domain (or attach a
   custom one like `admin.reeview.it`) that has nothing to do with the
   main site's deployment.

## 5. Optional: true user deletion

Deleting a Supabase Auth user requires the service-role key, which can
never live in a browser app. `supabase/functions/admin-delete-user`
is a ready-to-deploy Edge Function that does this safely server-side:

```bash
supabase functions deploy admin-delete-user
```

Without deploying it, the "Delete" button on Users still works via a
**soft delete** (anonymizes the profile, disables it from view, keeps the
auth account intact).

## Notes on permissions

Every admin has a row in `admin_users` with individual boolean columns —
there's no fixed role hierarchy in the database, just checkboxes. The
Roles page ships with a few presets (Moderator, Content Manager, Community
Manager, Owner) to fill those checkboxes quickly, but you can mix and
match per person.
