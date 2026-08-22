-- #24 Purge WhatsApp remnants: OTP + notifications are email-only now.
-- The whatsapp_otps table is dead — its only readers were the four
-- /api/auth/whatsapp/{send,verify} routes (deleted) and it is referenced by no
-- DB function, view, or foreign key. Email OTPs live in public.email_otps.
-- Backed up to /home/ubuntu/pelbu-backups/*-whatsapp-otps/ before dropping.

drop table if exists public.whatsapp_otps;
