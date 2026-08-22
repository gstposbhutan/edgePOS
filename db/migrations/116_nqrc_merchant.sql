-- Bhutan National QR Code (NQRC) merchant config, per entity. Powers the dynamic merchant-presented
-- payment QR shown at POS checkout for the ONLINE method: the vendor's bank/merchant details are
-- packaged with the exact bill amount into an EMVCo TLV string that any Bhutanese bank app parses.
--
-- The EMVCo-standard bits (currency BTN=064, country BT, dynamic amount tag 54, CRC-16) are handled
-- in code; the scheme-specific merchant-account template is kept configurable here because the RMA
-- Bhutan Financial Switch PSP GUID + tag are assigned by the vendor's bank.
ALTER TABLE public.entities
  ADD COLUMN IF NOT EXISTS nqrc_enabled       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nqrc_merchant_name text,        -- tag 59 (falls back to entities.name)
  ADD COLUMN IF NOT EXISTS nqrc_merchant_city text,        -- tag 60
  ADD COLUMN IF NOT EXISTS nqrc_account_id    text,        -- merchant ID / account no registered with the bank
  ADD COLUMN IF NOT EXISTS nqrc_psp_guid      text,        -- account-info template GUID (RMA/PSP scheme id)
  ADD COLUMN IF NOT EXISTS nqrc_mcc           text,        -- tag 52 merchant category code (4 digits)
  ADD COLUMN IF NOT EXISTS nqrc_account_tag   text NOT NULL DEFAULT '26';  -- EMVCo merchant-account template tag (26-51)
