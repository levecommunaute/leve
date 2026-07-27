INSERT INTO public.feature_flags (nom, actif, description)
VALUES (
  'video-controls-switch',
  false,
  'Mode B — controls: 1 pendant 45s (vue comptabilisée) puis controls: 0 · Mode A = controls 1 permanent avec div bloquer progression'
)
ON CONFLICT (nom) DO NOTHING;
