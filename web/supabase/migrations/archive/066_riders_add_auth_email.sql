-- Migration 066: Add auth_email to riders table
-- Avoids needing auth.admin.getUserById in the login route —
-- we can call generateLink directly with the stored email.

ALTER TABLE riders ADD COLUMN IF NOT EXISTS auth_email TEXT;

-- Back-fill demo rider
UPDATE riders SET auth_email = 'rider@demo.bt'
WHERE id = 'e1000000-0000-4000-8000-000000000002';
