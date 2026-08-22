-- Best-effort backfill of debtor_email for legacy phone-keyed consumer khata accounts,
-- so the email-first credit lookup resolves them. Resolve phone → customer entity
-- (entities.whatsapp_no) → auth email. Accounts with no resolvable email are left as-is
-- (they remain phone-resolvable and need manual email association).
UPDATE khata_accounts k
   SET debtor_email = lower(u.email)
  FROM entities e
  JOIN auth.users u ON u.id = e.id
 WHERE k.party_type = 'CONSUMER'
   AND k.debtor_email IS NULL
   AND k.debtor_phone IS NOT NULL
   AND e.role = 'CUSTOMER'
   AND e.whatsapp_no = k.debtor_phone
   AND u.email IS NOT NULL;
