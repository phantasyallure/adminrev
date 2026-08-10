-- Reeviewit — add a Google Maps link to places.
-- Additive, safe to run even if you already ran admin_schema.sql.

alter table public.places
  add column if not exists google_maps_url text;
