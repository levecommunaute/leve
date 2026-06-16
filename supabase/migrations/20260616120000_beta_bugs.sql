-- Rapports de bugs envoyés par les beta testeurs via le bouton flottant "Signaler un bug".

CREATE TABLE IF NOT EXISTS public.beta_bugs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membre_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  page text NOT NULL,
  description text NOT NULL,
  severite text NOT NULL DEFAULT 'P3' CHECK (severite IN ('P1', 'P2', 'P3')),
  statut text NOT NULL DEFAULT 'ouvert' CHECK (statut IN ('ouvert', 'en_cours', 'resolu', 'ferme')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS beta_bugs_created_idx
  ON public.beta_bugs (created_at DESC);

CREATE INDEX IF NOT EXISTS beta_bugs_membre_idx
  ON public.beta_bugs (membre_id, created_at DESC);

ALTER TABLE public.beta_bugs ENABLE ROW LEVEL SECURITY;

-- Un beta testeur peut consulter ses propres rapports.
CREATE POLICY beta_bugs_select_own
  ON public.beta_bugs
  FOR SELECT
  TO authenticated
  USING (membre_id = auth.uid());

GRANT SELECT ON TABLE public.beta_bugs TO authenticated;

-- Les insertions se font côté serveur via la clé service role (route API),
-- aucune policy INSERT n'est donc accordée aux clients authentifiés/anon.
