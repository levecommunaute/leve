-- Progression de visionnage par membre / vidéo (vérification 60 %)
CREATE TABLE IF NOT EXISTS public.video_progress (
  membre_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.videos (id) ON DELETE CASCADE,
  max_progress numeric(5, 2) NOT NULL DEFAULT 0 CHECK (max_progress >= 0 AND max_progress <= 100),
  unlocked boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (membre_id, video_id)
);

CREATE INDEX IF NOT EXISTS video_progress_membre_idx
  ON public.video_progress (membre_id);

ALTER TABLE public.video_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY video_progress_select_own
  ON public.video_progress
  FOR SELECT
  TO authenticated
  USING (membre_id = auth.uid());

CREATE POLICY video_progress_insert_own
  ON public.video_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (membre_id = auth.uid());

CREATE POLICY video_progress_update_own
  ON public.video_progress
  FOR UPDATE
  TO authenticated
  USING (membre_id = auth.uid())
  WITH CHECK (membre_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON TABLE public.video_progress TO authenticated;
