-- Colonnes PA (achat depuis banque, taxes 2 %)
ALTER TABLE public.pa_transactions
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS cout_dollars numeric(14, 2),
  ADD COLUMN IF NOT EXISTS taxe numeric(14, 2),
  ADD COLUMN IF NOT EXISTS taxe_communaute numeric(14, 2),
  ADD COLUMN IF NOT EXISTS taxe_fonctionnement numeric(14, 2);

CREATE INDEX IF NOT EXISTS pa_transactions_membre_created_idx
  ON public.pa_transactions (membre_id, created_at DESC);

ALTER TABLE public.pa_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pa_transactions_select_own ON public.pa_transactions;
CREATE POLICY pa_transactions_select_own
  ON public.pa_transactions
  FOR SELECT
  TO authenticated
  USING (membre_id = auth.uid());

GRANT SELECT ON TABLE public.pa_transactions TO authenticated;

-- Débit banque ($) : mouvements négatifs pour achats PA
GRANT SELECT, INSERT ON TABLE public.banque_membres_mouvements TO service_role;
