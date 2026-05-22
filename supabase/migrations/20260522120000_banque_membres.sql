-- Solde banque ($) par membre + journal des crédits (redistributions, etc.)
CREATE TABLE IF NOT EXISTS public.banque_membres (
  membre_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  solde_dollars numeric(14, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.banque_membres_mouvements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membre_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  montant numeric(14, 2) NOT NULL,
  type text NOT NULL DEFAULT 'redistribution',
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS banque_membres_mouvements_membre_created_idx
  ON public.banque_membres_mouvements (membre_id, created_at DESC);

ALTER TABLE public.banque_membres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banque_membres_mouvements ENABLE ROW LEVEL SECURITY;

CREATE POLICY banque_membres_select_own
  ON public.banque_membres
  FOR SELECT
  TO authenticated
  USING (membre_id = auth.uid());

CREATE POLICY banque_membres_mouvements_select_own
  ON public.banque_membres_mouvements
  FOR SELECT
  TO authenticated
  USING (membre_id = auth.uid());
