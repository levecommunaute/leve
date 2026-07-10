-- Cotisation mensuelle membre (Phase 2 — désactivée par défaut)
-- Prélevée sur solde banque LEVE le 1er du mois, en échange de points bonus PMQ.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cotisation_active BOOLEAN DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cotisation_montant NUMERIC DEFAULT 5;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cotisation_points_bonus INTEGER DEFAULT 10;

COMMENT ON COLUMN public.profiles.cotisation_active IS
  'Cotisation mensuelle active — prélevée sur solde banque LEVE le 1er du mois.';
COMMENT ON COLUMN public.profiles.cotisation_montant IS
  'Montant mensuel de cotisation ($5, $10 ou $15).';
COMMENT ON COLUMN public.profiles.cotisation_points_bonus IS
  'Points PMQ bonus crédités en compensation de la cotisation.';

INSERT INTO public.feature_flags (nom, actif, description)
VALUES (
  'cotisation-membre',
  false,
  'Cotisation mensuelle membre — $5 à $15/mois prélevée sur solde banque LEVE'
)
ON CONFLICT (nom) DO NOTHING;
