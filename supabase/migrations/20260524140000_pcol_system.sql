-- PCOL : points collaborateur (20 % des gains quiz sur vidéos collaborateur)
-- Pending : 8 % récupérables dans l'année, 12 % crédités immédiatement via pcol_transactions

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS collaborateur_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS videos_collaborateur_id_idx
  ON public.videos (collaborateur_id)
  WHERE collaborateur_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.pcol_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborateur_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  video_id uuid REFERENCES public.videos (id) ON DELETE SET NULL,
  mois text NOT NULL CHECK (mois ~ '^\d{4}-\d{2}$'),
  pts_membres_gagnes numeric(12, 2) NOT NULL DEFAULT 0,
  pts_collab numeric(12, 2) NOT NULL DEFAULT 0,
  pts_membres_nets numeric(12, 2) NOT NULL DEFAULT 0,
  type text NOT NULL CHECK (type IN ('quiz', 'pending', 'plancher')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pcol_transactions_collaborateur_idx
  ON public.pcol_transactions (collaborateur_id, created_at DESC);

CREATE INDEX IF NOT EXISTS pcol_transactions_video_idx
  ON public.pcol_transactions (video_id);

CREATE TABLE IF NOT EXISTS public.pending_pcol (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborateur_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.videos (id) ON DELETE CASCADE,
  pts_pending numeric(12, 2) NOT NULL DEFAULT 0 CHECK (pts_pending >= 0),
  date_expiration timestamptz NOT NULL,
  recupere boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pending_pcol_collaborateur_idx
  ON public.pending_pcol (collaborateur_id, recupere);

CREATE UNIQUE INDEX IF NOT EXISTS pending_pcol_active_per_video
  ON public.pending_pcol (collaborateur_id, video_id)
  WHERE recupere = false;

ALTER TABLE public.pcol_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_pcol ENABLE ROW LEVEL SECURITY;

CREATE POLICY pcol_transactions_select_own
  ON public.pcol_transactions
  FOR SELECT
  TO authenticated
  USING (collaborateur_id = auth.uid());

CREATE POLICY pending_pcol_select_own
  ON public.pending_pcol
  FOR SELECT
  TO authenticated
  USING (collaborateur_id = auth.uid());

GRANT SELECT ON TABLE public.pcol_transactions TO authenticated;
GRANT SELECT ON TABLE public.pending_pcol TO authenticated;

UPDATE public.feature_flags
SET enabled = true
WHERE key = 'collaborateur';
