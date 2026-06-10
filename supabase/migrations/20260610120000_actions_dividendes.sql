-- Système Actions & Dividendes (Phase 1)

-- Configuration globale (ligne unique)
CREATE TABLE IF NOT EXISTS public.actions_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cle text NOT NULL UNIQUE DEFAULT 'principal',
  multiple_valorisation numeric(6, 2) NOT NULL DEFAULT 4,
  total_actions integer NOT NULL DEFAULT 1000,
  escompte_phase1 numeric(5, 4) NOT NULL DEFAULT 0.25,
  locked boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT actions_config_multiple_check CHECK (multiple_valorisation > 0),
  CONSTRAINT actions_config_total_actions_check CHECK (total_actions > 0),
  CONSTRAINT actions_config_escompte_check CHECK (escompte_phase1 > 0 AND escompte_phase1 <= 1)
);

CREATE OR REPLACE FUNCTION public.actions_config_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS actions_config_updated_at ON public.actions_config;
CREATE TRIGGER actions_config_updated_at
  BEFORE UPDATE ON public.actions_config
  FOR EACH ROW
  EXECUTE FUNCTION public.actions_config_set_updated_at();

INSERT INTO public.actions_config (cle) VALUES ('principal')
ON CONFLICT (cle) DO NOTHING;

-- Actionnaires (actions A + B)
CREATE TABLE IF NOT EXISTS public.actionnaires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  email text,
  type_actions text NOT NULL DEFAULT 'A'
    CHECK (type_actions IN ('A', 'B')),
  nb_actions integer NOT NULL DEFAULT 0,
  pourcentage numeric(6, 3) NOT NULL DEFAULT 0,
  actif boolean NOT NULL DEFAULT true,
  locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT actionnaires_nb_actions_check CHECK (nb_actions >= 0),
  CONSTRAINT actionnaires_pourcentage_check CHECK (pourcentage >= 0 AND pourcentage <= 100)
);

DROP TRIGGER IF EXISTS actionnaires_updated_at ON public.actionnaires;
CREATE TRIGGER actionnaires_updated_at
  BEFORE UPDATE ON public.actionnaires
  FOR EACH ROW
  EXECUTE FUNCTION public.actions_config_set_updated_at();

-- Revenus mensuels saisis par l'admin
CREATE TABLE IF NOT EXISTS public.revenus_mensuels_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mois text NOT NULL UNIQUE CHECK (mois ~ '^\d{4}-\d{2}$'),
  rev_youtube_adsense numeric(14, 2) NOT NULL DEFAULT 0 CHECK (rev_youtube_adsense >= 0),
  rev_programmatique numeric(14, 2) NOT NULL DEFAULT 0 CHECK (rev_programmatique >= 0),
  rev_partenaires numeric(14, 2) NOT NULL DEFAULT 0 CHECK (rev_partenaires >= 0),
  rev_boutique numeric(14, 2) NOT NULL DEFAULT 0 CHECK (rev_boutique >= 0),
  rev_autres numeric(14, 2) NOT NULL DEFAULT 0 CHECK (rev_autres >= 0),
  depenses_operationnelles numeric(14, 2) NOT NULL DEFAULT 0 CHECK (depenses_operationnelles >= 0),
  total_brut numeric(14, 2) NOT NULL DEFAULT 0 CHECK (total_brut >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Historique de valorisation calculée
CREATE TABLE IF NOT EXISTS public.valorisation_historique (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mois text NOT NULL UNIQUE CHECK (mois ~ '^\d{4}-\d{2}$'),
  total_brut numeric(14, 2) NOT NULL DEFAULT 0,
  revenus_annualises numeric(14, 2) NOT NULL DEFAULT 0,
  multiple_valorisation numeric(6, 2) NOT NULL DEFAULT 4,
  valeur_societe numeric(16, 2) NOT NULL DEFAULT 0,
  valeur_action numeric(14, 2) NOT NULL DEFAULT 0,
  pool_25 numeric(14, 2) NOT NULL DEFAULT 0,
  pool_dividendes numeric(14, 2) NOT NULL DEFAULT 0,
  prix_action_c numeric(14, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS valorisation_historique_mois_idx
  ON public.valorisation_historique (mois DESC);

-- Décisions trimestrielles de distribution de dividendes
CREATE TABLE IF NOT EXISTS public.dividendes_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trimestre text NOT NULL CHECK (trimestre ~ '^\d{4}-T[1-4]$'),
  montant_distribue numeric(14, 2) NOT NULL DEFAULT 0 CHECK (montant_distribue >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Distributions par actionnaire
CREATE TABLE IF NOT EXISTS public.dividendes_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid NOT NULL REFERENCES public.dividendes_decisions (id) ON DELETE CASCADE,
  actionnaire_id uuid NOT NULL REFERENCES public.actionnaires (id) ON DELETE CASCADE,
  pourcentage numeric(6, 3) NOT NULL DEFAULT 0,
  montant numeric(14, 2) NOT NULL DEFAULT 0 CHECK (montant >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dividendes_distributions_decision_idx
  ON public.dividendes_distributions (decision_id);

CREATE INDEX IF NOT EXISTS dividendes_distributions_actionnaire_idx
  ON public.dividendes_distributions (actionnaire_id);

-- Liste d'intérêt pour les actions C (CATC)
CREATE TABLE IF NOT EXISTS public.catc_interet_liste (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  nb_actions_souhaitees integer NOT NULL CHECK (nb_actions_souhaitees > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS catc_interet_liste_email_idx
  ON public.catc_interet_liste (email);

-- RLS : accès via service role uniquement, sauf lecture publique de la valorisation
ALTER TABLE public.actions_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actionnaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenus_mensuels_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.valorisation_historique ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dividendes_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dividendes_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catc_interet_liste ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS valorisation_historique_select_public ON public.valorisation_historique;
CREATE POLICY valorisation_historique_select_public
  ON public.valorisation_historique
  FOR SELECT
  TO anon, authenticated
  USING (true);

COMMENT ON TABLE public.actions_config IS
  'Configuration du système actions (multiple de valorisation, total actions A+B, escompte Phase 1)';
COMMENT ON TABLE public.actionnaires IS
  'Actionnaires LEVE (actions A et B) avec pourcentage de détention';
COMMENT ON TABLE public.revenus_mensuels_actions IS
  'Revenus mensuels validés par l''admin pour le calcul de valorisation';
COMMENT ON TABLE public.valorisation_historique IS
  'Historique mensuel de la valorisation de la société et du prix des actions';
COMMENT ON TABLE public.dividendes_decisions IS
  'Décisions trimestrielles de distribution de dividendes';
COMMENT ON TABLE public.dividendes_distributions IS
  'Montants de dividendes distribués par actionnaire pour chaque décision';
COMMENT ON TABLE public.catc_interet_liste IS
  'Liste d''intérêt publique pour l''achat d''actions C (CATC)';
