-- Migration 067: Store auth password on riders for session creation
-- generateLink/getUserById GoTrue admin calls fail for SQL-seeded users.
-- Storing the password allows signInWithPassword after PIN verification.

ALTER TABLE riders ADD COLUMN IF NOT EXISTS auth_password TEXT;

-- Demo rider password matches the auth.users encrypted_password seed
UPDATE riders SET auth_password = 'Rider@2026'
WHERE id = 'e1000000-0000-4000-8000-000000000002';
