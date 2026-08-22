-- Fix GoTrue admin API 500s caused by NULL token columns in auth.users.
--
-- GoTrue (self-hosted, v2.189) scans the auth string-token columns into
-- non-nullable Go strings. A single NULL in any row makes the admin endpoints
-- (GET /admin/users → listUsers, getUserById) fail with:
--   "Scan error on column ... confirmation_token: converting NULL to string is unsupported"
-- returning HTTP 500. That silently blanks every email surfaced through
-- supabase.auth.admin.* — team management, the admin user console, the POS
-- logout-handover cashier picker — and breaks getUserById in cart/shop/whatsapp
-- routes. Login is unaffected (it uses a narrower query), which masks the issue.
--
-- Seed data inserted some of these columns as NULL (002_seed.sql, rider@demo.bt).
-- GoTrue itself always writes '' for "no token", so coalescing NULL → '' is the
-- canonical, safe repair: it touches only email-confirmation / recovery / change
-- token columns — never passwords, sessions, or identities. Idempotent.

UPDATE auth.users SET
  confirmation_token         = COALESCE(confirmation_token, ''),
  recovery_token             = COALESCE(recovery_token, ''),
  email_change_token_new     = COALESCE(email_change_token_new, ''),
  email_change               = COALESCE(email_change, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change               = COALESCE(phone_change, ''),
  phone_change_token         = COALESCE(phone_change_token, ''),
  reauthentication_token     = COALESCE(reauthentication_token, '')
WHERE confirmation_token IS NULL
   OR recovery_token IS NULL
   OR email_change_token_new IS NULL
   OR email_change IS NULL
   OR email_change_token_current IS NULL
   OR phone_change IS NULL
   OR phone_change_token IS NULL
   OR reauthentication_token IS NULL;
