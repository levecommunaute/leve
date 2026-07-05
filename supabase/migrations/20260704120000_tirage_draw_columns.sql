-- Colonnes pour enregistrer le résultat du tirage trimestriel pondéré.

ALTER TABLE public.tirages
  ADD COLUMN IF NOT EXISTS gagnant_id uuid REFERENCES public.profiles (id),
  ADD COLUMN IF NOT EXISTS seed_sha256 text,
  ADD COLUMN IF NOT EXISTS date_tirage_reel timestamptz,
  ADD COLUMN IF NOT EXISTS total_tickets integer;
