-- Soft-disable videos without deleting them (admin Activer / Désactiver).

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.videos.is_active IS
  'Si false, la vidéo est inactive (masquable côté membres) sans suppression.';

CREATE INDEX IF NOT EXISTS videos_is_active_idx
  ON public.videos (is_active);
