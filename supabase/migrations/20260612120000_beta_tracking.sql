-- Système de tracking Beta : colonnes profiles, tables beta_actions / beta_sessions,
-- fonctions RPC pour incréments atomiques (points + temps total).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_beta_tester boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS beta_points numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS beta_derniere_activite timestamptz,
  ADD COLUMN IF NOT EXISTS beta_temps_total_secondes bigint NOT NULL DEFAULT 0;

-- Actions effectuées par les beta testeurs (page_view, etc.)
CREATE TABLE IF NOT EXISTS public.beta_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membre_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  action_type text NOT NULL,
  page text NOT NULL,
  points integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS beta_actions_membre_created_idx
  ON public.beta_actions (membre_id, created_at DESC);

-- Sessions de navigation des beta testeurs
CREATE TABLE IF NOT EXISTS public.beta_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membre_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  debut timestamptz NOT NULL DEFAULT now(),
  fin timestamptz,
  duree_secondes integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS beta_sessions_membre_idx
  ON public.beta_sessions (membre_id, debut DESC);

ALTER TABLE public.beta_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY beta_actions_select_own
  ON public.beta_actions
  FOR SELECT
  TO authenticated
  USING (membre_id = auth.uid());

CREATE POLICY beta_sessions_select_own
  ON public.beta_sessions
  FOR SELECT
  TO authenticated
  USING (membre_id = auth.uid());

GRANT SELECT ON TABLE public.beta_actions TO authenticated;
GRANT SELECT ON TABLE public.beta_sessions TO authenticated;

-- Enregistre une action beta (+10 points) et met à jour le profil.
CREATE OR REPLACE FUNCTION public.beta_track_action(
  p_action_type text,
  p_page text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'non authentifié';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_uid AND is_beta_tester
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.beta_actions (membre_id, action_type, page, points)
  VALUES (v_uid, p_action_type, p_page, 10)
  RETURNING id INTO v_id;

  UPDATE public.profiles
  SET beta_points = COALESCE(beta_points, 0) + 10,
      beta_derniere_activite = now()
  WHERE id = v_uid;

  RETURN v_id;
END;
$$;

-- Démarre une session beta (debut = NOW()) et retourne son id.
CREATE OR REPLACE FUNCTION public.beta_start_session()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'non authentifié';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_uid AND is_beta_tester
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.beta_sessions (membre_id, debut)
  VALUES (v_uid, now())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Termine une session beta : fin = NOW(), duree_secondes calculée,
-- puis cumul dans profiles.beta_temps_total_secondes.
CREATE OR REPLACE FUNCTION public.beta_end_session(p_session_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_duree integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'non authentifié';
  END IF;

  UPDATE public.beta_sessions
  SET fin = now(),
      duree_secondes = GREATEST(0, EXTRACT(EPOCH FROM (now() - debut))::integer)
  WHERE id = p_session_id
    AND membre_id = v_uid
    AND fin IS NULL
  RETURNING duree_secondes INTO v_duree;

  IF v_duree IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.profiles
  SET beta_temps_total_secondes = COALESCE(beta_temps_total_secondes, 0) + v_duree,
      beta_derniere_activite = now()
  WHERE id = v_uid;

  RETURN v_duree;
END;
$$;

GRANT EXECUTE ON FUNCTION public.beta_track_action(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.beta_start_session() TO authenticated;
GRANT EXECUTE ON FUNCTION public.beta_end_session(uuid) TO authenticated;
