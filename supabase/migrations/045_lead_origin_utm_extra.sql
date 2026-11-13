-- 045_lead_origin_utm_extra.sql
-- Completa a origem do lead: UTMs de anúncio/palavra-chave e os
-- códigos de clique do Google Ads (gclid) e da Meta (fbclid).

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS utm_content text,
  ADD COLUMN IF NOT EXISTS utm_term text,
  ADD COLUMN IF NOT EXISTS gclid text,
  ADD COLUMN IF NOT EXISTS fbclid text;
