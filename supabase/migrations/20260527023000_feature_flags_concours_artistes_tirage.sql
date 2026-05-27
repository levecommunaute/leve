INSERT INTO public.feature_flags (nom, actif, description) VALUES
  ('concours-artistes', false, 'Section concours artistes'),
  ('tirage', false, 'Section tirage trimestriel')
ON CONFLICT (nom) DO NOTHING;
