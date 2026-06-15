-- Liste blanche des emails autorisés à rejoindre la beta.
-- Accès uniquement via service role (routes API) : RLS activée sans policy publique.

CREATE TABLE IF NOT EXISTS public.beta_emails_autorises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  nom_testeur text,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Email unique (normalisé en minuscules côté application).
CREATE UNIQUE INDEX IF NOT EXISTS beta_emails_autorises_email_key
  ON public.beta_emails_autorises (lower(email));

ALTER TABLE public.beta_emails_autorises ENABLE ROW LEVEL SECURITY;
