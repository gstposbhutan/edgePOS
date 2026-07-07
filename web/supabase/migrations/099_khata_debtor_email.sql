-- Credit identity moves from phone to email (WhatsApp dropped): consumer khata accounts
-- are looked up by the debtor's email. Additive + backfilled so existing accounts keep working.
ALTER TABLE khata_accounts ADD COLUMN IF NOT EXISTS debtor_email text;

-- Backfill from the debtor's auth email (customer entity id == auth user id).
UPDATE khata_accounts k
   SET debtor_email = lower(u.email)
  FROM auth.users u
 WHERE k.debtor_entity_id = u.id
   AND k.debtor_email IS NULL
   AND u.email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_khata_debtor_email
  ON khata_accounts (creditor_entity_id, debtor_email)
  WHERE party_type = 'CONSUMER';
