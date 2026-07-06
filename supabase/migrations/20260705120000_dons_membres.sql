-- Dons de points PMQ entre membres (5–50 pts / transfert)

CREATE TABLE IF NOT EXISTS public.dons_membres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donneur_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  receveur_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  pts_pmq integer NOT NULL CHECK (pts_pmq >= 5 AND pts_pmq <= 50),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (donneur_id <> receveur_id)
);

CREATE INDEX IF NOT EXISTS dons_membres_donneur_idx
  ON public.dons_membres (donneur_id, created_at DESC);

CREATE INDEX IF NOT EXISTS dons_membres_receveur_idx
  ON public.dons_membres (receveur_id, created_at DESC);

ALTER TABLE public.dons_membres ENABLE ROW LEVEL SECURITY;

CREATE POLICY dons_membres_select_donneur
  ON public.dons_membres
  FOR SELECT
  TO authenticated
  USING (donneur_id = auth.uid());

CREATE POLICY dons_membres_select_receveur
  ON public.dons_membres
  FOR SELECT
  TO authenticated
  USING (receveur_id = auth.uid());

GRANT SELECT ON TABLE public.dons_membres TO authenticated;

INSERT INTO public.feature_flags (nom, actif, description)
VALUES (
  'dons-membres',
  false,
  'Dons entre membres — min 5 pts · max 50 pts PMQ'
)
ON CONFLICT (nom) DO NOTHING;
