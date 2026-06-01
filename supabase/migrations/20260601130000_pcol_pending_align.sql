-- Alignement PCOL / pending_pcol avec les documents LEVE

ALTER TABLE public.pcol_transactions
  ADD COLUMN IF NOT EXISTS membre_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pcol_transactions_membre_idx
  ON public.pcol_transactions (collaborateur_id, membre_id)
  WHERE membre_id IS NOT NULL;

ALTER TABLE public.pending_pcol
  ADD COLUMN IF NOT EXISTS points_amount numeric(12, 2),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text;

UPDATE public.pending_pcol
SET
  points_amount = COALESCE(points_amount, pts_pending),
  expires_at = COALESCE(expires_at, date_expiration),
  status = COALESCE(
    status,
    CASE WHEN recupere THEN 'recovered' ELSE 'pending' END
  )
WHERE points_amount IS NULL
   OR expires_at IS NULL
   OR status IS NULL;

ALTER TABLE public.pending_pcol
  ALTER COLUMN points_amount SET DEFAULT 0,
  ALTER COLUMN status SET DEFAULT 'pending';

UPDATE public.pending_pcol
SET points_amount = 0
WHERE points_amount IS NULL;

UPDATE public.pending_pcol
SET status = 'pending'
WHERE status IS NULL;

DROP INDEX IF EXISTS public.pending_pcol_active_per_video;

CREATE INDEX IF NOT EXISTS pending_pcol_collaborateur_status_idx
  ON public.pending_pcol (collaborateur_id, status)
  WHERE status IS DISTINCT FROM 'recovered';
