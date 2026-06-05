-- Configuration des réseaux sociaux (bandeau « En direct » sur la page d'accueil)

CREATE TABLE IF NOT EXISTS public.reseaux_sociaux_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseau text NOT NULL UNIQUE,
  abonnes integer NOT NULL DEFAULT 0,
  actif boolean NOT NULL DEFAULT false,
  ordre integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reseaux_sociaux_config_reseau_check
    CHECK (reseau IN ('youtube', 'facebook', 'tiktok', 'instagram'))
);

CREATE INDEX IF NOT EXISTS reseaux_sociaux_config_ordre_idx
  ON public.reseaux_sociaux_config (ordre);

CREATE OR REPLACE FUNCTION public.reseaux_sociaux_config_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reseaux_sociaux_config_updated_at ON public.reseaux_sociaux_config;
CREATE TRIGGER reseaux_sociaux_config_updated_at
  BEFORE UPDATE ON public.reseaux_sociaux_config
  FOR EACH ROW
  EXECUTE FUNCTION public.reseaux_sociaux_config_set_updated_at();

ALTER TABLE public.reseaux_sociaux_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reseaux_sociaux_config_select_public ON public.reseaux_sociaux_config;
CREATE POLICY reseaux_sociaux_config_select_public
  ON public.reseaux_sociaux_config
  FOR SELECT
  TO anon, authenticated
  USING (true);

INSERT INTO public.reseaux_sociaux_config (reseau, abonnes, actif, ordre) VALUES
  ('youtube', 0, false, 1),
  ('facebook', 0, false, 2),
  ('tiktok', 0, false, 3),
  ('instagram', 0, false, 4)
ON CONFLICT (reseau) DO NOTHING;
