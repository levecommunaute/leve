INSERT INTO public.feature_flags (nom, actif, description)
VALUES (
  'mini-player-pip',
  false,
  'Barre mini-player (PiP) sur la page vidéo'
)
ON CONFLICT (nom) DO NOTHING;
