-- Aligner le schéma avec l'API admin (colonne cle au lieu de pool_key)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transparence_config'
      AND column_name = 'pool_key'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transparence_config'
      AND column_name = 'cle'
  ) THEN
    ALTER TABLE public.transparence_config RENAME COLUMN pool_key TO cle;
  END IF;
END $$;
