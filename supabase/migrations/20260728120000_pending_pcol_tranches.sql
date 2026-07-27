-- Tranches mensuelles de pending PCOL (8 %) — crédit $ à la redistribution, pas en temps réel

CREATE TABLE IF NOT EXISTS public.pending_pcol_tranches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pending_pcol_id uuid NOT NULL REFERENCES public.pending_pcol (id) ON DELETE CASCADE,
  collaborateur_id uuid NOT NULL,
  video_id uuid NOT NULL,
  mois text NOT NULL CHECK (mois ~ '^\d{4}-\d{2}$'),
  pts numeric NOT NULL DEFAULT 0 CHECK (pts >= 0),
  paye boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pending_pcol_id, mois)
);

CREATE INDEX IF NOT EXISTS pending_pcol_tranches_collab_mois_paye_idx
  ON public.pending_pcol_tranches (collaborateur_id, mois, paye);

CREATE INDEX IF NOT EXISTS pending_pcol_tranches_video_mois_idx
  ON public.pending_pcol_tranches (video_id, mois);

ALTER TABLE public.pending_pcol_tranches ENABLE ROW LEVEL SECURITY;

CREATE POLICY pending_pcol_tranches_select_own
  ON public.pending_pcol_tranches
  FOR SELECT
  TO authenticated
  USING (collaborateur_id = auth.uid());

GRANT SELECT ON TABLE public.pending_pcol_tranches TO authenticated;
