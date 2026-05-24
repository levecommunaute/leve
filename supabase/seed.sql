-- =============================================================================
-- LEVE local / staging seed data
-- =============================================================================
-- Prereqs (align migrations with this file):
--   - auth.users / auth.identities: standard Supabase Auth tables
--   - public.profiles: id uuid PK REFERENCES auth.users(id), display_name text,
--     email text, member_type text, numero_membre text, multiplier numeric,
--     points numeric/int, solde numeric(14,2) DEFAULT 0, points_pmq numeric optional,
--     derniere_redistribution timestamptz null, created_at/updated_at optional
--   - public.videos: id uuid PK, youtube_id text UNIQUE, title text,
--     description text, points_value int, duration_seconds int null, created_at
--   - public.video_codes: id uuid PK, video_id uuid REFERENCES videos(id) ON DELETE CASCADE,
--     fragment_code char(4) CHECK (length = 4), timestamp_seconds int NOT NULL
--   - public.banque_leve: single row with total_revenue, pool_ptc, pool_pcol, pool_pa, pool_operations
--   - public.quiz_questions: optional; not populated here (use Edge generer-quiz)
-- =============================================================================
-- Reset seed-owned rows (order respects FKs)
-- =============================================================================

DELETE FROM public.video_codes WHERE video_id IN (
  SELECT id FROM public.videos WHERE youtube_id LIKE 'LEVEseed%'
);
DELETE FROM public.videos WHERE youtube_id LIKE 'LEVEseed%';

DELETE FROM public.profiles WHERE id IN (
  '11111111-1111-4111-8111-111111110001',
  '11111111-1111-4111-8111-111111110002',
  '11111111-1111-4111-8111-111111110003',
  '11111111-1111-4111-8111-111111110004',
  '11111111-1111-4111-8111-111111110005',
  '11111111-1111-4111-8111-111111110006',
  '11111111-1111-4111-8111-111111110007',
  '11111111-1111-4111-8111-111111110008',
  '11111111-1111-4111-8111-111111110009',
  '11111111-1111-4111-8111-11111111000a',
  '11111111-1111-4111-8111-11111111000b',
  '11111111-1111-4111-8111-11111111000c'
);

DELETE FROM auth.identities WHERE user_id IN (
  '11111111-1111-4111-8111-111111110001',
  '11111111-1111-4111-8111-111111110002',
  '11111111-1111-4111-8111-111111110003',
  '11111111-1111-4111-8111-111111110004',
  '11111111-1111-4111-8111-111111110005',
  '11111111-1111-4111-8111-111111110006',
  '11111111-1111-4111-8111-111111110007',
  '11111111-1111-4111-8111-111111110008',
  '11111111-1111-4111-8111-111111110009',
  '11111111-1111-4111-8111-11111111000a',
  '11111111-1111-4111-8111-11111111000b',
  '11111111-1111-4111-8111-11111111000c'
);

DELETE FROM auth.users WHERE id IN (
  '11111111-1111-4111-8111-111111110001',
  '11111111-1111-4111-8111-111111110002',
  '11111111-1111-4111-8111-111111110003',
  '11111111-1111-4111-8111-111111110004',
  '11111111-1111-4111-8111-111111110005',
  '11111111-1111-4111-8111-111111110006',
  '11111111-1111-4111-8111-111111110007',
  '11111111-1111-4111-8111-111111110008',
  '11111111-1111-4111-8111-111111110009',
  '11111111-1111-4111-8111-11111111000a',
  '11111111-1111-4111-8111-11111111000b',
  '11111111-1111-4111-8111-11111111000c'
);

-- =============================================================================
-- Auth: 12 fictional members (password for local email provider: SeedLeve2026!)
-- =============================================================================

INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  raw_app_meta_data,
  raw_user_meta_data,
  is_sso_user,
  is_anonymous
) VALUES
  ('11111111-1111-4111-8111-111111110001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pionnier1@seed.leve.test', crypt('SeedLeve2026!', gen_salt('bf')), now(), now(), now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Alexandre Pionnier"}', false, false),
  ('11111111-1111-4111-8111-111111110002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pionnier2@seed.leve.test', crypt('SeedLeve2026!', gen_salt('bf')), now(), now(), now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Brigitte Pionnier"}', false, false),
  ('11111111-1111-4111-8111-111111110003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fondateur1@seed.leve.test', crypt('SeedLeve2026!', gen_salt('bf')), now(), now(), now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Camille Fondateur"}', false, false),
  ('11111111-1111-4111-8111-111111110004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fondateur2@seed.leve.test', crypt('SeedLeve2026!', gen_salt('bf')), now(), now(), now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"full_name":"David Fondateur"}', false, false),
  ('11111111-1111-4111-8111-111111110005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fondateur3@seed.leve.test', crypt('SeedLeve2026!', gen_salt('bf')), now(), now(), now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Élodie Fondateur"}', false, false),
  ('11111111-1111-4111-8111-111111110006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'communaute1@seed.leve.test', crypt('SeedLeve2026!', gen_salt('bf')), now(), now(), now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Fabien Communauté"}', false, false),
  ('11111111-1111-4111-8111-111111110007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'communaute2@seed.leve.test', crypt('SeedLeve2026!', gen_salt('bf')), now(), now(), now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Gaëlle Communauté"}', false, false),
  ('11111111-1111-4111-8111-111111110008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'communaute3@seed.leve.test', crypt('SeedLeve2026!', gen_salt('bf')), now(), now(), now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Hugo Communauté"}', false, false),
  ('11111111-1111-4111-8111-111111110009', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'communaute4@seed.leve.test', crypt('SeedLeve2026!', gen_salt('bf')), now(), now(), now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Inès Communauté"}', false, false),
  ('11111111-1111-4111-8111-11111111000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'communaute5@seed.leve.test', crypt('SeedLeve2026!', gen_salt('bf')), now(), now(), now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Julien Communauté"}', false, false),
  ('11111111-1111-4111-8111-11111111000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'collaborateur@seed.leve.test', crypt('SeedLeve2026!', gen_salt('bf')), now(), now(), now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Karine Collaborateur"}', false, false),
  ('11111111-1111-4111-8111-11111111000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'kevin.edge@seed.leve.test', crypt('SeedLeve2026!', gen_salt('bf')), now(), now(), now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Kevin EdgeCase"}', false, false);

INSERT INTO auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at,
  id
) VALUES
  ('pionnier1@seed.leve.test', '11111111-1111-4111-8111-111111110001', jsonb_build_object('sub', '11111111-1111-4111-8111-111111110001', 'email', 'pionnier1@seed.leve.test'), 'email', now(), now(), now(), gen_random_uuid()),
  ('pionnier2@seed.leve.test', '11111111-1111-4111-8111-111111110002', jsonb_build_object('sub', '11111111-1111-4111-8111-111111110002', 'email', 'pionnier2@seed.leve.test'), 'email', now(), now(), now(), gen_random_uuid()),
  ('fondateur1@seed.leve.test', '11111111-1111-4111-8111-111111110003', jsonb_build_object('sub', '11111111-1111-4111-8111-111111110003', 'email', 'fondateur1@seed.leve.test'), 'email', now(), now(), now(), gen_random_uuid()),
  ('fondateur2@seed.leve.test', '11111111-1111-4111-8111-111111110004', jsonb_build_object('sub', '11111111-1111-4111-8111-111111110004', 'email', 'fondateur2@seed.leve.test'), 'email', now(), now(), now(), gen_random_uuid()),
  ('fondateur3@seed.leve.test', '11111111-1111-4111-8111-111111110005', jsonb_build_object('sub', '11111111-1111-4111-8111-111111110005', 'email', 'fondateur3@seed.leve.test'), 'email', now(), now(), now(), gen_random_uuid()),
  ('communaute1@seed.leve.test', '11111111-1111-4111-8111-111111110006', jsonb_build_object('sub', '11111111-1111-4111-8111-111111110006', 'email', 'communaute1@seed.leve.test'), 'email', now(), now(), now(), gen_random_uuid()),
  ('communaute2@seed.leve.test', '11111111-1111-4111-8111-111111110007', jsonb_build_object('sub', '11111111-1111-4111-8111-111111110007', 'email', 'communaute2@seed.leve.test'), 'email', now(), now(), now(), gen_random_uuid()),
  ('communaute3@seed.leve.test', '11111111-1111-4111-8111-111111110008', jsonb_build_object('sub', '11111111-1111-4111-8111-111111110008', 'email', 'communaute3@seed.leve.test'), 'email', now(), now(), now(), gen_random_uuid()),
  ('communaute4@seed.leve.test', '11111111-1111-4111-8111-111111110009', jsonb_build_object('sub', '11111111-1111-4111-8111-111111110009', 'email', 'communaute4@seed.leve.test'), 'email', now(), now(), now(), gen_random_uuid()),
  ('communaute5@seed.leve.test', '11111111-1111-4111-8111-11111111000a', jsonb_build_object('sub', '11111111-1111-4111-8111-11111111000a', 'email', 'communaute5@seed.leve.test'), 'email', now(), now(), now(), gen_random_uuid()),
  ('collaborateur@seed.leve.test', '11111111-1111-4111-8111-11111111000b', jsonb_build_object('sub', '11111111-1111-4111-8111-11111111000b', 'email', 'collaborateur@seed.leve.test'), 'email', now(), now(), now(), gen_random_uuid()),
  ('kevin.edge@seed.leve.test', '11111111-1111-4111-8111-11111111000c', jsonb_build_object('sub', '11111111-1111-4111-8111-11111111000c', 'email', 'kevin.edge@seed.leve.test'), 'email', now(), now(), now(), gen_random_uuid());

-- =============================================================================
-- public.profiles — 2 Pionniers, 3 Fondateurs, 5 Communauté, 1 Collaborateur, Kevin edge
-- =============================================================================

INSERT INTO public.profiles (
  id,
  email,
  display_name,
  member_type,
  numero_membre,
  multiplier,
  points,
  solde,
  points_pmq,
  derniere_redistribution
) VALUES
  ('11111111-1111-4111-8111-111111110001', 'pionnier1@seed.leve.test', 'Alexandre Pionnier', 'Pionnier', '1', 2.0, 420, 1250.00, 180.5, NULL),
  ('11111111-1111-4111-8111-111111110002', 'pionnier2@seed.leve.test', 'Brigitte Pionnier', 'Pionnier', '2', 2.0, 380, 980.25, 160.0, NULL),
  ('11111111-1111-4111-8111-111111110003', 'fondateur1@seed.leve.test', 'Camille Fondateur', 'Fondateur', '1001', 2.0, 310, 2100.00, 95.25, NULL),
  ('11111111-1111-4111-8111-111111110004', 'fondateur2@seed.leve.test', 'David Fondateur', 'Fondateur', '1002', 2.0, 275, 1875.50, 88.00, NULL),
  ('11111111-1111-4111-8111-111111110005', 'fondateur3@seed.leve.test', 'Élodie Fondateur', 'Fondateur', '1003', 2.0, 260, 1650.00, 72.40, NULL),
  ('11111111-1111-4111-8111-111111110006', 'communaute1@seed.leve.test', 'Fabien Communauté', 'Communaute', '10001', 1.0, 190, 450.00, 40.00, NULL),
  ('11111111-1111-4111-8111-111111110007', 'communaute2@seed.leve.test', 'Gaëlle Communauté', 'Communaute', '10002', 1.0, 175, 520.75, 35.10, NULL),
  ('11111111-1111-4111-8111-111111110008', 'communaute3@seed.leve.test', 'Hugo Communauté', 'Communaute', '10003', 1.0, 160, 300.00, 28.00, NULL),
  ('11111111-1111-4111-8111-111111110009', 'communaute4@seed.leve.test', 'Inès Communauté', 'Communaute', '10004', 1.0, 145, 275.25, 22.50, NULL),
  ('11111111-1111-4111-8111-11111111000a', 'communaute5@seed.leve.test', 'Julien Communauté', 'Communaute', '10005', 1.0, 130, 410.00, 18.00, NULL),
  ('11111111-1111-4111-8111-11111111000b', 'collaborateur@seed.leve.test', 'Karine Collaborateur', 'Collaborateur', '20001', 1.2, 220, 890.00, 55.00, NULL),
  ('11111111-1111-4111-8111-11111111000c', 'kevin.edge@seed.leve.test', 'Kevin EdgeCase', 'Communaute', '10006', 1.0, 12, 0.45, 1.25, NULL);

-- =============================================================================
-- public.videos — 6 test videos (points_value 15, 25, or 30)
-- youtube_id: 11 chars (YouTube-style)
-- =============================================================================

INSERT INTO public.videos (id, youtube_id, title, description, points_value, duration_seconds, collaborateur_id, created_at) VALUES
  ('22222222-2222-4222-8222-222222220001', 'LEVEseedV01', 'LEVE Seed — Introduction PMQ', 'Contenu fictif pour valider codes et quiz.', 15, 920, NULL, now()),
  ('22222222-2222-4222-8222-222222220002', 'LEVEseedV02', 'LEVE Seed — Pool et redistribution', 'Deuxième vidéo de test.', 25, 1180, NULL, now()),
  ('22222222-2222-4222-8222-222222220003', 'LEVEseedV03', 'LEVE Seed — Multiplicateurs', 'Troisième vidéo de test.', 30, 840, NULL, now()),
  ('22222222-2222-4222-8222-222222220004', 'LEVEseedV04', 'LEVE Seed — Communauté', 'Quatrième vidéo de test.', 15, 1320, NULL, now()),
  ('22222222-2222-4222-8222-222222220005', 'LEVEseedV05', 'LEVE Seed — Collaborateurs', 'Cinquième vidéo de test.', 25, 760, '11111111-1111-4111-8111-11111111000b', now()),
  ('22222222-2222-4222-8222-222222220006', 'LEVEseedV06', 'LEVE Seed — Cas limites solde', 'Sixième vidéo de test.', 30, 990, NULL, now());

-- =============================================================================
-- public.video_codes — 3 fragments per video (XXXX), timestamps spread in seconds
-- =============================================================================

INSERT INTO public.video_codes (id, video_id, fragment_code, timestamp_seconds) VALUES
  -- Video 1 (15 pts) — codes: A1B2, C3D4, E5F6
  (gen_random_uuid(), '22222222-2222-4222-8222-222222220001', 'A1B2', 42),
  (gen_random_uuid(), '22222222-2222-4222-8222-222222220001', 'C3D4', 385),
  (gen_random_uuid(), '22222222-2222-4222-8222-222222220001', 'E5F6', 812),
  -- Video 2 (25 pts) — G7H8, J9K0, L1M2
  (gen_random_uuid(), '22222222-2222-4222-8222-222222220002', 'G7H8', 55),
  (gen_random_uuid(), '22222222-2222-4222-8222-222222220002', 'J9K0', 502),
  (gen_random_uuid(), '22222222-2222-4222-8222-222222220002', 'L1M2', 1044),
  -- Video 3 (30 pts) — N3P4, Q5R6, S7T8
  (gen_random_uuid(), '22222222-2222-4222-8222-222222220003', 'N3P4', 28),
  (gen_random_uuid(), '22222222-2222-4222-8222-222222220003', 'Q5R6', 410),
  (gen_random_uuid(), '22222222-2222-4222-8222-222222220003', 'S7T8', 795),
  -- Video 4 (15 pts) — U9V0, W1X2, Y3Z4
  (gen_random_uuid(), '22222222-2222-4222-8222-222222220004', 'U9V0', 118),
  (gen_random_uuid(), '22222222-2222-4222-8222-222222220004', 'W1X2', 640),
  (gen_random_uuid(), '22222222-2222-4222-8222-222222220004', 'Y3Z4', 1210),
  -- Video 5 (25 pts) — Z5A6, B7C8, D9E0
  (gen_random_uuid(), '22222222-2222-4222-8222-222222220005', 'Z5A6', 67),
  (gen_random_uuid(), '22222222-2222-4222-8222-222222220005', 'B7C8', 355),
  (gen_random_uuid(), '22222222-2222-4222-8222-222222220005', 'D9E0', 702),
  -- Video 6 (30 pts) — F1G2, H3I4, K5L6
  (gen_random_uuid(), '22222222-2222-4222-8222-222222220006', 'F1G2', 95),
  (gen_random_uuid(), '22222222-2222-4222-8222-222222220006', 'H3I4', 520),
  (gen_random_uuid(), '22222222-2222-4222-8222-222222220006', 'K5L6', 955);

-- =============================================================================
-- public.banque_leve — sample revenue for PMQ 45% dry-run (Edge: redistribution-mensuelle)
-- Idempotent: first row gets total_revenue = 10000; if table empty, inserts one row.
-- Adjust column list if your migration names differ.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.banque_leve LIMIT 1) THEN
    UPDATE public.banque_leve
    SET
      total_revenue = 10000.00,
      pool_ptc = COALESCE(pool_ptc, 0),
      pool_pcol = COALESCE(pool_pcol, 0),
      pool_pa = COALESCE(pool_pa, 0),
      pool_operations = COALESCE(pool_operations, 0)
    WHERE id = (SELECT id FROM public.banque_leve ORDER BY id LIMIT 1);
  ELSE
    INSERT INTO public.banque_leve (total_revenue, pool_ptc, pool_pcol, pool_pa, pool_operations)
    VALUES (10000.00, 0, 0, 0, 0);
  END IF;
END $$;
