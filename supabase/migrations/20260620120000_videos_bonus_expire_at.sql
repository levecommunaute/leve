-- Bonus 72h sur les quiz : colonne d'expiration du bonus ×2 par vidéo.
-- Quand bonus_expire_at > NOW(), les points du quiz sont doublés.

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS bonus_expire_at timestamptz;

COMMENT ON COLUMN public.videos.bonus_expire_at IS
  'Fin de la fenêtre de bonus ×2 (72h après publication). Si > now(), les points du quiz sont doublés.';
