-- Phase 1 sécurité banque LEVE — profil KYC léger, retraits, journal

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nom_legal TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS date_naissance DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pays_residence_fiscale TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telephone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telephone_verifie_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS adresse TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS palier_verification INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profil_verifie_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS retrait_methode TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS retrait_identifiant TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS retrait_gele_jusqua TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notif_quiz BOOLEAN DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notif_redistribution BOOLEAN DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notif_concours BOOLEAN DEFAULT true;

CREATE TABLE IF NOT EXISTS retraits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membre_id UUID NOT NULL REFERENCES auth.users(id),
  montant NUMERIC NOT NULL,
  methode TEXT NOT NULL,
  identifiant_destination TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'en_attente'
    CHECK (statut IN ('en_attente','code_confirme','delai_securite','execute','annule','gele')),
  code_confirmation TEXT,
  code_expire_at TIMESTAMPTZ,
  executable_a_partir_de TIMESTAMPTZ,
  execute_at TIMESTAMPTZ,
  annule_at TIMESTAMPTZ,
  annule_par TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS securite_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membre_id UUID NOT NULL,
  action TEXT NOT NULL,
  details JSONB,
  ip TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS retraits_membre_created_idx
  ON public.retraits (membre_id, created_at DESC);

CREATE INDEX IF NOT EXISTS securite_journal_membre_created_idx
  ON public.securite_journal (membre_id, created_at DESC);

ALTER TABLE public.retraits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.securite_journal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS retraits_select_own ON public.retraits;
CREATE POLICY retraits_select_own
  ON public.retraits
  FOR SELECT
  TO authenticated
  USING (membre_id = auth.uid());

DROP POLICY IF EXISTS securite_journal_select_own ON public.securite_journal;
CREATE POLICY securite_journal_select_own
  ON public.securite_journal
  FOR SELECT
  TO authenticated
  USING (membre_id = auth.uid());

GRANT SELECT ON TABLE public.retraits TO authenticated;
GRANT SELECT ON TABLE public.securite_journal TO authenticated;

COMMENT ON COLUMN public.profiles.nom_legal IS
  'Nom légal du membre (requis pour retrait)';
COMMENT ON COLUMN public.profiles.retrait_gele_jusqua IS
  'Gel des retraits jusqu''à cette date (ex. 72h après changement de méthode)';
COMMENT ON COLUMN public.profiles.palier_verification IS
  'Niveau de vérification identité (0 = non vérifié)';
COMMENT ON TABLE public.retraits IS
  'Demandes de retrait banque LEVE';
COMMENT ON TABLE public.securite_journal IS
  'Journal d''actions sécurité (profil, retrait, gel)';
