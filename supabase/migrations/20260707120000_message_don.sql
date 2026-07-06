-- Message affiché sur la page Dons communautaires

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS message_don text;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_message_don_length
  CHECK (message_don IS NULL OR char_length(message_don) <= 200);

COMMENT ON COLUMN public.profiles.message_don IS
  'Message de demande de don (max 200 car.) — visible si profil_public = true';
