-- PCOL : colonnes brut + pondéré (multiplicateur membre)

ALTER TABLE public.pcol_transactions
  ADD COLUMN IF NOT EXISTS multiplicateur_membre numeric(6, 2) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS pts_membres_gagnes_ponderes numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pts_collab_ponderes numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pts_membres_nets_ponderes numeric(12, 2) NOT NULL DEFAULT 0;

-- Lignes existantes : pondéré = brut (multiplicateur implicite 1)
UPDATE public.pcol_transactions
SET
  multiplicateur_membre = 1,
  pts_membres_gagnes_ponderes = pts_membres_gagnes,
  pts_collab_ponderes = pts_collab,
  pts_membres_nets_ponderes = pts_membres_nets
WHERE pts_membres_gagnes_ponderes = 0
  AND (pts_membres_gagnes <> 0 OR pts_collab <> 0 OR pts_membres_nets <> 0);
