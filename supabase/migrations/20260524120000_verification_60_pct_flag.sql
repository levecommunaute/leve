INSERT INTO public.feature_flags (nom, actif, description) VALUES
  ('verification-60-pct', false, 'Vérification 60% visionnage avant code vidéo')
ON CONFLICT (nom) DO NOTHING;
