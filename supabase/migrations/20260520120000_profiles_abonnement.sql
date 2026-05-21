-- Colonnes abonnement YouTube sur public.profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS abonnement_verifie_at timestamptz,
  ADD COLUMN IF NOT EXISTS abonnement_expire_at timestamptz,
  ADD COLUMN IF NOT EXISTS abonnement_statut text,
  ADD COLUMN IF NOT EXISTS grace_debut_at timestamptz,
  ADD COLUMN IF NOT EXISTS grace_expire_at timestamptz;

COMMENT ON COLUMN public.profiles.abonnement_statut IS 'actif | grace | expire';
