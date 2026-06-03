-- Scénario B : suivre les crédits 12 % déjà versés via redistribution

ALTER TABLE public.pcol_transactions
  ADD COLUMN IF NOT EXISTS paye boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS pcol_transactions_impaye_idx
  ON public.pcol_transactions (collaborateur_id)
  WHERE paye = false;

-- Backfill : mois déjà couverts par une redistribution → considérés payés (ancienne logique mois = mois_actuel)
UPDATE public.pcol_transactions pt
SET paye = true
WHERE paye = false
  AND EXISTS (
    SELECT 1
    FROM public.redistribution_history rh
    WHERE to_char(rh.month::date, 'YYYY-MM') = pt.mois
  );
