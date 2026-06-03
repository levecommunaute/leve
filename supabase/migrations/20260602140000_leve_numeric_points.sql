-- Colonnes points / PCOL : INTEGER → NUMERIC (valeurs réelles sans arrondi entier)

ALTER TABLE public.pcol_transactions
  ALTER COLUMN pts_membres_gagnes TYPE numeric USING pts_membres_gagnes::numeric,
  ALTER COLUMN pts_collab TYPE numeric USING pts_collab::numeric,
  ALTER COLUMN pts_membres_nets TYPE numeric USING pts_membres_nets::numeric,
  ALTER COLUMN pts_membres_gagnes_ponderes TYPE numeric USING pts_membres_gagnes_ponderes::numeric,
  ALTER COLUMN pts_collab_ponderes TYPE numeric USING pts_collab_ponderes::numeric,
  ALTER COLUMN pts_membres_nets_ponderes TYPE numeric USING pts_membres_nets_ponderes::numeric;

ALTER TABLE public.pending_pcol
  ALTER COLUMN points_pending_cumul TYPE numeric USING points_pending_cumul::numeric,
  ALTER COLUMN valeur_dollars_cumul TYPE numeric USING valeur_dollars_cumul::numeric;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'points_transactions' AND column_name = 'amount'
  ) THEN
    ALTER TABLE public.points_transactions
      ALTER COLUMN amount TYPE numeric USING amount::numeric;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'points_ponderes' AND column_name = 'pts_bruts'
  ) THEN
    ALTER TABLE public.points_ponderes
      ALTER COLUMN pts_bruts TYPE numeric USING pts_bruts::numeric,
      ALTER COLUMN pts_ponderes TYPE numeric USING pts_ponderes::numeric;
  END IF;
END $$;
