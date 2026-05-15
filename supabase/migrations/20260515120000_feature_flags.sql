-- Feature flags pour le déploiement progressif des fonctionnalités LEVE

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL UNIQUE,
  actif boolean NOT NULL DEFAULT false,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feature_flags_nom_idx ON public.feature_flags (nom);

CREATE OR REPLACE FUNCTION public.feature_flags_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS feature_flags_updated_at ON public.feature_flags;
CREATE TRIGGER feature_flags_updated_at
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION public.feature_flags_set_updated_at();

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feature_flags_select_public ON public.feature_flags;
CREATE POLICY feature_flags_select_public
  ON public.feature_flags
  FOR SELECT
  TO anon, authenticated
  USING (true);

INSERT INTO public.feature_flags (nom, actif, description) VALUES
  ('boutique', false, 'Page boutique LEVE'),
  ('concours', true, 'Page concours actifs'),
  ('classement', true, 'Page classement membres'),
  ('pool-pa', false, 'Pool Activités PA'),
  ('collaborateur', false, 'Espace collaborateur')
ON CONFLICT (nom) DO NOTHING;
