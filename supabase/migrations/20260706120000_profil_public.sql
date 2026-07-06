-- Profil membre visible publiquement sur /profil/[numero_membre]

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profil_public BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.profil_public IS
  'Si true, le profil est accessible sur /profil/[numero_membre]';
