-- Migration 065: Seed demo rider account
-- Rider login: phone +97517999001, PIN 1234
-- Auth login:  rider@demo.bt / Rider@2026
--
-- PIN hash generated with pgcrypto crypt() using bf (bcrypt) which is
-- compatible with bcryptjs used in the API routes.

-- Create auth user for the demo rider
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,  -- email_verified required for signInWithPassword to work
  role,
  aud,
  created_at,
  updated_at
)
VALUES (
  'e1000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'rider@demo.bt',
  crypt('Rider@2026', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"RIDER","email_verified":true}',
  'authenticated',
  'authenticated',
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Create identity record required for email login
-- provider_id must be the user UUID (not the email) for Supabase auth to resolve it
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
VALUES (
  'e1000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  jsonb_build_object('sub', 'e1000000-0000-4000-8000-000000000001', 'email', 'rider@demo.bt', 'email_verified', true),
  'email',
  'e1000000-0000-4000-8000-000000000001',
  now(),
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  provider_id    = 'e1000000-0000-4000-8000-000000000001',
  identity_data  = jsonb_build_object('sub', 'e1000000-0000-4000-8000-000000000001', 'email', 'rider@demo.bt', 'email_verified', true);

-- Create rider record
-- PIN 1234 hashed with bcrypt (bf/10 rounds) — compatible with bcryptjs
INSERT INTO riders (
  id,
  name,
  whatsapp_no,
  pin_hash,
  is_active,
  is_available,
  auth_user_id
)
VALUES (
  'e1000000-0000-4000-8000-000000000002',
  'Demo Rider',
  '+97517999001',
  crypt('1234', gen_salt('bf', 10)),
  true,
  true,
  'e1000000-0000-4000-8000-000000000001'
)
ON CONFLICT (id) DO NOTHING;
