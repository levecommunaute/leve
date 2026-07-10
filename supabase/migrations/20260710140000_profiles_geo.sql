-- Géolocalisation membre (pays / ville / continent) — détectée à l'inscription via IP.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pays TEXT DEFAULT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ville TEXT DEFAULT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS continent TEXT DEFAULT NULL;

COMMENT ON COLUMN public.profiles.pays IS
  'Pays détecté à l''inscription (ipapi.co) ou renseigné manuellement.';
COMMENT ON COLUMN public.profiles.ville IS
  'Ville détectée à l''inscription (ipapi.co).';
COMMENT ON COLUMN public.profiles.continent IS
  'Continent normalisé : Amériques, Europe, Afrique, Asie, Océanie.';
