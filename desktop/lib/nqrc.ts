// Bhutan National QR Code (NQRC) — dynamic merchant-presented payment QR payload builder.
// Produces the EMVCo TLV string a Bhutanese bank app (mBoB/BNB/eTeeru…) scans to auto-fill the
// merchant and the exact bill amount. EMVCo-standard fields (currency BTN=064, country BT, dynamic
// amount in tag 54, CRC-16) are fixed here; the scheme-specific merchant-account template
// (tag + GUID + merchant id) comes from per-vendor config synced down from the cloud.
// Mirror of web/lib/nqrc.js — keep the two in sync.

export interface NqrcMerchant {
  enabled?: boolean;
  accountTag?: string;   // EMVCo merchant-account template tag (26-51)
  pspGuid?: string;      // scheme GUID (RMA/PSP)
  accountId?: string;    // merchant id / account no
  merchantName?: string; // tag 59
  merchantCity?: string; // tag 60
  mcc?: string;          // tag 52
}

// One EMVCo data object: 2-digit tag + 2-digit zero-padded length + value.
function tlv(tag: string, value: string): string {
  const v = String(value ?? "");
  return `${tag}${String(v.length).padStart(2, "0")}${v}`;
}

// CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) over an ASCII string → 4 upper-hex chars.
export function crc16(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const cap = (s: string | undefined, n: number) => String(s ?? "").trim().slice(0, n);

/** True when a merchant has the minimum config to generate a scannable QR. */
export function nqrcReady(m: NqrcMerchant | null | undefined): boolean {
  return !!(m && m.enabled && m.pspGuid && m.accountId);
}

/**
 * Build a dynamic (amount-embedded) NQRC payload. Returns null when config or amount is missing,
 * so callers can simply hide the QR.
 */
export function buildNqrcPayload(
  merchant: NqrcMerchant | null | undefined,
  amount: number,
  opts: { reference?: string } = {}
): string | null {
  const amt = Number(amount);
  if (!nqrcReady(merchant) || !Number.isFinite(amt) || amt <= 0) return null;
  const m = merchant as NqrcMerchant;

  const accountTag = m.accountTag || "26";
  // Merchant Account Information template: 00 = scheme GUID, 01 = merchant/account id.
  const account = tlv("00", cap(m.pspGuid, 32)) + tlv("01", cap(m.accountId, 32));

  let payload =
    tlv("00", "01") +                                        // payload format indicator
    tlv("01", "12") +                                        // point of initiation: dynamic
    tlv(accountTag, account) +                               // merchant account info (scheme template)
    tlv("52", cap(m.mcc || "0000", 4)) +                     // merchant category code
    tlv("53", "064") +                                       // transaction currency: BTN
    tlv("54", amt.toFixed(2)) +                              // transaction amount
    tlv("58", "BT") +                                        // country code
    tlv("59", cap(m.merchantName || "MERCHANT", 25)) +       // merchant name
    tlv("60", cap(m.merchantCity || "THIMPHU", 15));         // merchant city

  if (opts.reference) {
    payload += tlv("62", tlv("01", cap(opts.reference, 25))); // additional data: bill / reference no
  }

  // The CRC is computed over the whole payload INCLUDING the CRC field's own tag+length ("6304").
  payload += "6304";
  return payload + crc16(payload);
}
