INSERT INTO public.feature_flags (nom, actif, description) VALUES
  ('beta-exclusif', false, 'Phase beta privée : masque les boutons Rejoindre / Se connecter / YouTube sur la page d''accueil (accès par invitation /beta?code=XXXXX uniquement)')
ON CONFLICT (nom) DO NOTHING;
