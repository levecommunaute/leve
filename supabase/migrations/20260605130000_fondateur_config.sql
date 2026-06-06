-- Configuration du bandeau « Statut Fondateur » sur la page d'accueil

CREATE TABLE IF NOT EXISTS public.fondateur_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actif boolean NOT NULL DEFAULT false,
  membres_actuels integer NOT NULL DEFAULT 0,
  membres_max integer NOT NULL DEFAULT 10000,
  message text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fondateur_config_membres_actuels_check CHECK (membres_actuels >= 0),
  CONSTRAINT fondateur_config_membres_max_check CHECK (membres_max > 0)
);

CREATE OR REPLACE FUNCTION public.fondateur_config_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fondateur_config_updated_at ON public.fondateur_config;
CREATE TRIGGER fondateur_config_updated_at
  BEFORE UPDATE ON public.fondateur_config
  FOR EACH ROW
  EXECUTE FUNCTION public.fondateur_config_set_updated_at();

ALTER TABLE public.fondateur_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fondateur_config_select_public ON public.fondateur_config;
CREATE POLICY fondateur_config_select_public
  ON public.fondateur_config
  FOR SELECT
  TO anon, authenticated
  USING (true);

INSERT INTO public.fondateur_config (actif, membres_actuels, membres_max, message)
SELECT
  false,
  0,
  10000,
  'Rejoins les premiers membres et obtiens le statut Fondateur avec un multiplicateur 2.0x.'
WHERE NOT EXISTS (SELECT 1 FROM public.fondateur_config);
