-- PTC : utilisations admin + journal des mouvements par source

CREATE TABLE IF NOT EXISTS public.ptc_utilisations_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categorie text NOT NULL UNIQUE
    CHECK (categorie IN ('promotion', 'outils', 'reserve')),
  actif boolean NOT NULL DEFAULT false,
  budget_alloue numeric(14, 2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ptc_utilisations_config_budget_check CHECK (budget_alloue >= 0)
);

CREATE OR REPLACE FUNCTION public.ptc_utilisations_config_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ptc_utilisations_config_updated_at ON public.ptc_utilisations_config;
CREATE TRIGGER ptc_utilisations_config_updated_at
  BEFORE UPDATE ON public.ptc_utilisations_config
  FOR EACH ROW
  EXECUTE FUNCTION public.ptc_utilisations_config_set_updated_at();

ALTER TABLE public.ptc_utilisations_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ptc_utilisations_config_select_public ON public.ptc_utilisations_config;
CREATE POLICY ptc_utilisations_config_select_public
  ON public.ptc_utilisations_config
  FOR SELECT
  TO anon, authenticated
  USING (true);

INSERT INTO public.ptc_utilisations_config (categorie, actif, budget_alloue) VALUES
  ('promotion', false, 0),
  ('outils', false, 0),
  ('reserve', false, 0)
ON CONFLICT (categorie) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ptc_mouvements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL
    CHECK (source IN ('quiz_perdu', 'pending_expire', 'collab_perdu')),
  montant numeric(14, 2) NOT NULL DEFAULT 0,
  pts_equivalent numeric(14, 2) NOT NULL DEFAULT 0,
  collaborateur_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  mois text NOT NULL CHECK (mois ~ '^\d{4}-\d{2}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ptc_mouvements_montant_check CHECK (montant >= 0),
  CONSTRAINT ptc_mouvements_pts_check CHECK (pts_equivalent >= 0)
);

CREATE INDEX IF NOT EXISTS ptc_mouvements_source_idx
  ON public.ptc_mouvements (source);

CREATE INDEX IF NOT EXISTS ptc_mouvements_mois_idx
  ON public.ptc_mouvements (mois);

CREATE INDEX IF NOT EXISTS ptc_mouvements_collaborateur_mois_idx
  ON public.ptc_mouvements (collaborateur_id, mois)
  WHERE collaborateur_id IS NOT NULL;

ALTER TABLE public.ptc_mouvements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ptc_mouvements_select_own ON public.ptc_mouvements;
CREATE POLICY ptc_mouvements_select_own
  ON public.ptc_mouvements
  FOR SELECT
  TO authenticated
  USING (collaborateur_id = auth.uid());

COMMENT ON TABLE public.ptc_utilisations_config IS
  'Budgets et activation des utilisations du Pool de Croissance (PTC)';
COMMENT ON TABLE public.ptc_mouvements IS
  'Journal PTC : quiz perdus, pending expiré, % collab non récupéré';
