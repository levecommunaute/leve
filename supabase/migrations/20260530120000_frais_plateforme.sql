-- Frais plateforme : paliers configurables + feature flag

CREATE TABLE IF NOT EXISTS public.frais_plateforme_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  montant_min numeric(14, 2) NOT NULL DEFAULT 0,
  montant_max numeric(14, 2),
  pourcentage numeric(6, 3) NOT NULL DEFAULT 0,
  actif boolean NOT NULL DEFAULT true,
  ordre integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS frais_plateforme_config_ordre_idx
  ON public.frais_plateforme_config (ordre);

CREATE OR REPLACE FUNCTION public.frais_plateforme_config_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS frais_plateforme_config_updated_at ON public.frais_plateforme_config;
CREATE TRIGGER frais_plateforme_config_updated_at
  BEFORE UPDATE ON public.frais_plateforme_config
  FOR EACH ROW
  EXECUTE FUNCTION public.frais_plateforme_config_set_updated_at();

ALTER TABLE public.frais_plateforme_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS frais_plateforme_config_select_public ON public.frais_plateforme_config;
CREATE POLICY frais_plateforme_config_select_public
  ON public.frais_plateforme_config
  FOR SELECT
  TO anon, authenticated
  USING (true);

INSERT INTO public.frais_plateforme_config (nom, montant_min, montant_max, pourcentage, actif, ordre)
SELECT v.nom, v.montant_min, v.montant_max, v.pourcentage, v.actif, v.ordre
FROM (
  VALUES
    ('Palier 1'::text, 0::numeric, 99.99::numeric, 2.0::numeric, true, 1),
    ('Palier 2', 100, 499.99, 1.5, true, 2),
    ('Palier 3', 500, NULL::numeric, 1.0, true, 3)
) AS v(nom, montant_min, montant_max, pourcentage, actif, ordre)
WHERE NOT EXISTS (SELECT 1 FROM public.frais_plateforme_config LIMIT 1);

INSERT INTO public.feature_flags (nom, actif, description) VALUES
  ('frais-plateforme', false, 'Frais de plateforme sur les transactions en USD')
ON CONFLICT (nom) DO NOTHING;
