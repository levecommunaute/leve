-- Compteur de tentatives de code email (blocage à 3)
ALTER TABLE public.retraits
  ADD COLUMN IF NOT EXISTS code_tentatives INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.retraits.code_tentatives IS
  'Nombre de tentatives invalides pour le code email de confirmation';
