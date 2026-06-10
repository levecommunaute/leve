-- Actionnaires : siège (1 à 6) et rôle affichés dans l'admin

ALTER TABLE public.actionnaires
  ADD COLUMN IF NOT EXISTS siege integer,
  ADD COLUMN IF NOT EXISTS role text;

CREATE UNIQUE INDEX IF NOT EXISTS actionnaires_siege_idx
  ON public.actionnaires (siege)
  WHERE siege IS NOT NULL;

-- Seed des 6 sièges si la table est vide (structure éditable ensuite via l'admin)
INSERT INTO public.actionnaires (siege, nom, type_actions, nb_actions, pourcentage, role)
SELECT s.n,
       'Siège ' || s.n,
       CASE WHEN s.n = 1 THEN 'A' ELSE 'B' END,
       0,
       0,
       NULL
FROM generate_series(1, 6) AS s (n)
WHERE NOT EXISTS (SELECT 1 FROM public.actionnaires);

COMMENT ON COLUMN public.actionnaires.siege IS 'Numéro de siège (1 à 6) affiché dans l''admin';
COMMENT ON COLUMN public.actionnaires.role IS 'Rôle de l''actionnaire (ex. Fondateur, Investisseur)';
