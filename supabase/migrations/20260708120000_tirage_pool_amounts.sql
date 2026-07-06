-- Montants du pool distribué après le tirage trimestriel.

ALTER TABLE public.tirages
  ADD COLUMN IF NOT EXISTS montant_pool numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS montant_gagnant numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS montant_fondation numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS montant_fonctionnement numeric DEFAULT 0;

COMMENT ON COLUMN public.tirages.montant_pool IS
  'Pool net du tirage (total_tickets × 10 PA × 5 $/pt, taxe 2 % déjà prélevée à l''achat).';
COMMENT ON COLUMN public.tirages.montant_gagnant IS '80 % du pool crédité au gagnant (banque_membres).';
COMMENT ON COLUMN public.tirages.montant_fondation IS '10 % du pool vers banque_leve.fondation_balance.';
COMMENT ON COLUMN public.tirages.montant_fonctionnement IS '10 % du pool vers banque_leve.operations_balance.';
