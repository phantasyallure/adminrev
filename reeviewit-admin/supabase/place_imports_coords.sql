-- Adds Latitude/Longitude support to the bulk-import queue, so a scraper
-- that already captured real coordinates from Google Maps can carry them
-- straight through to publish instead of falling back to address geocoding
-- (which fails for informal/cooperative-style Algerian addresses).
--
-- Run this after place_imports.sql.

alter table public.place_imports
  add column if not exists lat double precision,
  add column if not exists lng double precision;
