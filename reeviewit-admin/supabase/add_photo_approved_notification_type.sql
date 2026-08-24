-- Run this once in the Supabase SQL editor for the Rayyek/Reeviewit
-- project (same project used by both the main site and this admin panel).
--
-- Registers 'photo_approved' as an allowed `notifications.type`, so
-- approving a "place photos" submission in Admin → Place photos can
-- notify the person who submitted it — same pattern as
-- 'suggestion_approved'/'review_approved'/'product_approved'.
--
-- Safe to re-run: drops and recreates the check constraint.

alter table public.notifications drop constraint if exists notifications_type_check;

alter table public.notifications add constraint notifications_type_check
  check (
    type in (
      'review_reply',
      'review_approved',
      'product_approved',
      'suggestion_approved',
      'photo_approved'
    )
  );
