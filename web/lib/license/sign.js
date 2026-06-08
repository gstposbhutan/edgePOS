import { createPrivateKey, createPublicKey, sign as edSign, verify as edVerify } from 'node:crypto'
import { LICENSE_PUBLIC_KEY_B64 } from './public-key'

// .lic token format:  nxslic.<base64url(payloadJSON)>.<base64url(ed25519 sig)>
// The signature covers "nxslic.<payload>". Offline-verifiable with the embedded
// public key (the desktop app reimplements verifyLicense with the same pubkey).
const PREFIX = 'nxslic'

const b64url = (buf) => Buffer.from(buf).toString('base64url')
const fromB64url = (s) => Buffer.from(s, 'base64url')

function privateKey() {
  const b64 = process.env.LICENSE_SIGNING_PRIVATE_KEY
  if (!b64) throw new Error('LICENSE_SIGNING_PRIVATE_KEY is not set')
  return createPrivateKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'pkcs8' })
}

function publicKey() {
  return createPublicKey({ key: Buffer.from(LICENSE_PUBLIC_KEY_B64, 'base64'), format: 'der', type: 'spki' })
}

/** Build + sign a .lic token from a payload object. */
export function buildLicense(payload) {
  const body = b64url(JSON.stringify(payload))
  const sig = b64url(edSign(null, Buffer.from(`${PREFIX}.${body}`), privateKey()))
  return `${PREFIX}.${body}.${sig}`
}

/** Verify a .lic token; returns the payload object or throws. */
export function verifyLicense(lic) {
  const parts = String(lic).split('.')
  if (parts.length !== 3 || parts[0] !== PREFIX) throw new Error('malformed license')
  const [, body, sig] = parts
  if (!edVerify(null, Buffer.from(`${PREFIX}.${body}`), publicKey(), fromB64url(sig))) {
    throw new Error('bad signature')
  }
  return JSON.parse(fromB64url(body).toString('utf8'))
}
