-- Colonnes dédiées frais plateforme et taxe PA (communauté 75 %)

ALTER TABLE public.banque_leve
  ADD COLUMN IF NOT EXISTS frais_plateforme_balance numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxe_pa_balance numeric(14, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.banque_leve.frais_plateforme_balance IS
  'Frais plateforme collectés (5–8 % transactions + 25 % taxe 2 % PA)';
COMMENT ON COLUMN public.banque_leve.taxe_pa_balance IS
  'Part communauté (75 %) de la taxe 2 % sur utilisations PA';

CREATE TABLE IF NOT EXISTS public.transparence_config (
  pool_key text PRIMARY KEY,
  label text NOT NULL,
  section text NOT NULL DEFAULT 'banque'
    CHECK (section IN ('banque', 'frais')),
  visible boolean NOT NULL DEFAULT true,
  ordre integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.transparence_config_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transparence_config_updated_at ON public.transparence_config;
CREATE TRIGGER transparence_config_updated_at
  BEFORE UPDATE ON public.transparence_config
  FOR EACH ROW
  EXECUTE FUNCTION public.transparence_config_set_updated_at();

ALTER TABLE public.transparence_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transparence_config_select_public ON public.transparence_config;
CREATE POLICY transparence_config_select_public
  ON public.transparence_config
  FOR SELECT
  TO anon, authenticated
  USING (true);

INSERT INTO public.transparence_config (pool_key, label, section, visible, ordre)
VALUES
  ('pmq', 'PMQ — Pool Mensuelle Quiz', 'banque', true, 1),
  ('production', 'Production — Équipe fondatrice (20%)', 'banque', true, 2),
  ('fondation', 'Fondation LEVE (10%)', 'banque', true, 3),
  ('operations', 'Opérations — LEVE MÉDIA INC. (25%)', 'banque', true, 4),
  ('ptc', 'PTC — Pool de Croissance', 'banque', true, 5),
  ('pcol', 'PCOL — Pool Collaborateur', 'banque', true, 6),
  ('pa', 'PA — Pool Activités', 'banque', true, 7),
  ('frais_plateforme', 'Frais plateforme collectés (5-8%)', 'frais', true, 8),
  ('taxe_pa', 'Taxe 2% PA — communauté (75%)', 'frais', true, 9)
ON CONFLICT (pool_key) DO NOTHING;
