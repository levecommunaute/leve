INSERT INTO public.feature_flags (nom, actif, description)
VALUES (
  'redistribution-cumulee',
  false,
  'Mode pré-monétisation — cumule tous les points depuis le début'
)
ON CONFLICT (nom) DO NOTHING;
