-- Date d'acquisition des points pending (quiz soumis)
ALTER TABLE public.pending_pcol
  ADD COLUMN IF NOT EXISTS earned_date timestamptz;

UPDATE public.pending_pcol
SET earned_date = created_at
WHERE earned_date IS NULL;

ALTER TABLE public.pending_pcol
  ALTER COLUMN earned_date SET DEFAULT now();
