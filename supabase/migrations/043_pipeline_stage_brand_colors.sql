-- Cores das etapas do funil na paleta da marca SohoM.
UPDATE public.pipeline_stages SET color = CASE lower(color)
  WHEN '#3b82f6' THEN '#999999'
  WHEN '#eab308' THEN '#000000'
  WHEN '#f97316' THEN '#ff3d77'
  WHEN '#8b5cf6' THEN '#e5004c'
  WHEN '#22c55e' THEN '#16a34a'
  ELSE color END
WHERE lower(color) IN ('#3b82f6','#eab308','#f97316','#8b5cf6','#22c55e');

ALTER TABLE public.pipeline_stages ALTER COLUMN color SET DEFAULT '#999999';
