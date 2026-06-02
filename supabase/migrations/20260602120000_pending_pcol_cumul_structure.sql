-- Structure PCOL pending : un enregistrement cumulatif par vidéo / collaborateur

ALTER TABLE public.pending_pcol
  ADD COLUMN IF NOT EXISTS points_pending_cumul numeric(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valeur_dollars_cumul numeric(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS statut text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS pourcentage_fixe numeric(5, 2),
  ADD COLUMN IF NOT EXISTS recupere_le timestamptz;

UPDATE public.pending_pcol
SET
  points_pending_cumul = COALESCE(
    points_pending_cumul,
    points_amount,
    pts_pending,
    0
  ),
  statut = COALESCE(
    statut,
    CASE
      WHEN status IN ('recovered', 'transferred') OR recupere = true THEN 'recupere'
      WHEN status = 'expired' THEN 'expired'
      ELSE 'pending'
    END
  ),
  date_expiration = COALESCE(date_expiration, expires_at, created_at + interval '1 year')
WHERE points_pending_cumul IS NULL
   OR statut IS NULL
   OR date_expiration IS NULL;

ALTER TABLE public.pending_pcol
  ALTER COLUMN points_pending_cumul SET DEFAULT 0,
  ALTER COLUMN valeur_dollars_cumul SET DEFAULT 0,
  ALTER COLUMN statut SET DEFAULT 'pending';

UPDATE public.pending_pcol
SET points_pending_cumul = 0
WHERE points_pending_cumul IS NULL;

UPDATE public.pending_pcol
SET statut = 'pending'
WHERE statut IS NULL;

-- Un seul enregistrement par vidéo par collaborateur
CREATE UNIQUE INDEX IF NOT EXISTS pending_pcol_one_per_video
  ON public.pending_pcol (collaborateur_id, video_id);

CREATE INDEX IF NOT EXISTS pending_pcol_collaborateur_statut_idx
  ON public.pending_pcol (collaborateur_id, statut);
