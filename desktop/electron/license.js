const { createPublicKey, verify } = require("node:crypto");

// Ed25519 license PUBLIC key (base64 SPKI DER). MUST stay identical to
// web/lib/license/public-key.js — the web super-admin issuer signs with the matching
// private key (LICENSE_SIGNING_PRIVATE_KEY, server secret). This lets the terminal
// verify a .lic fully OFFLINE; online revocation is a separate check.
const LICENSE_PUBLIC_KEY_B64 = "MCowBQYDK2VwAyEAxj73T7ag6Tiv/XfKKtqjk3Nyo/TotaXd0v29TilF8Io=";

const PREFIX = "nxslic";

let _pub = null;
function publicKey() {
  if (!_pub) {
    _pub = createPublicKey({
      key: Buffer.from(LICENSE_PUBLIC_KEY_B64, "base64"),
      format: "der",
      type: "spki",
    });
  }
  return _pub;
}

/**
 * Verify a .lic token fully offline: signature → payload → expiry → machine lock.
 * Token format: `nxslic.<base64url(payloadJSON)>.<base64url(sig)>`.
 *
 * @param {string} lic        the raw .lic file contents
 * @param {string} machineId  this terminal's machine id (machine-id.js getMachineId())
 * @returns {{valid: boolean, payload?: object, reason?: string}}
 *   reason ∈ missing | malformed | bad_signature | bad_payload | expired | machine_mismatch | verify_error
 */
function verifyLicense(lic, machineId) {
  if (!lic || typeof lic !== "string") return { valid: false, reason: "missing" };

  const parts = lic.trim().split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX) return { valid: false, reason: "malformed" };
  const [, body, sig] = parts;

  let ok;
  try {
    ok = verify(null, Buffer.from(`${PREFIX}.${body}`), publicKey(), Buffer.from(sig, "base64url"));
  } catch (e) {
    return { valid: false, reason: "verify_error" };
  }
  if (!ok) return { valid: false, reason: "bad_signature" };

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch (e) {
    return { valid: false, reason: "bad_payload" };
  }

  if (payload.expires_at && new Date(payload.expires_at).getTime() < Date.now()) {
    return { valid: false, payload, reason: "expired" };
  }
  if (payload.machine_id && machineId && payload.machine_id !== machineId) {
    return { valid: false, payload, reason: "machine_mismatch" };
  }

  return { valid: true, payload };
}

module.exports = { verifyLicense, LICENSE_PUBLIC_KEY_B64 };
