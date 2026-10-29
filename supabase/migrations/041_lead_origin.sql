-- 041_lead_origin.sql
-- Lead origin tracking: where each contact/deal came from.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS source text;

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS landing_page text,
  ADD COLUMN IF NOT EXISTS lead_message text;