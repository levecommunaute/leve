-- Système de parrainage LEVE : code membre + filleuls

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS code_parrainage text,
  ADD COLUMN IF NOT EXISTS derniere_activite timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_code_parrainage_unique_idx
  ON public.profiles (code_parrainage)
  WHERE code_parrainage IS NOT NULL;

COMMENT ON COLUMN public.profiles.code_parrainage IS
  'Code unique LEVE-XXXXXX pour inviter un ami.';
COMMENT ON COLUMN public.profiles.derniere_activite IS
  'Dernière activité membre (quiz, connexion, etc.) — utilisé pour activer le parrainage.';

CREATE TABLE IF NOT EXISTS public.parrainages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parrain_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  filleul_id uuid NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  code_parrainage text NOT NULL,
  statut text NOT NULL DEFAULT 'pending'
    CHECK (statut IN ('pending', 'actif', 'expire')),
  created_at timestamptz NOT NULL DEFAULT now(),
  active_at timestamptz
);

CREATE INDEX IF NOT EXISTS parrainages_parrain_statut_idx
  ON public.parrainages (parrain_id, statut);

CREATE INDEX IF NOT EXISTS parrainages_statut_created_idx
  ON public.parrainages (statut, created_at);

ALTER TABLE public.parrainages ENABLE ROW LEVEL SECURITY;

CREATE POLICY parrainages_select_parrain
  ON public.parrainages
  FOR SELECT
  TO authenticated
  USING (parrain_id = auth.uid());

CREATE POLICY parrainages_select_filleul
  ON public.parrainages
  FOR SELECT
  TO authenticated
  USING (filleul_id = auth.uid());

GRANT SELECT ON TABLE public.parrainages TO authenticated;
