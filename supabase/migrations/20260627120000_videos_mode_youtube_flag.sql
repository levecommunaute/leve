INSERT INTO public.feature_flags (nom, actif, description) VALUES
  (
    'videos-mode-youtube',
    false,
    'Page Vidéos en mode feed YouTube : dernière vidéo à bonus 72h actif en grand, liste compacte en dessous'
  )
ON CONFLICT (nom) DO NOTHING;
