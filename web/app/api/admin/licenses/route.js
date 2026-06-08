import { NextResponse } from 'next/server'
import { randomBytes, createHash, randomUUID } from 'node:crypto'
import { getAuthContext } from '@/lib/supabase/server'
import { buildLicense } from '@/lib/license/sign'

// Super-admin only — the software vendor issues licenses for ANY store (not entity-scoped).
const SUPER = 'SUPER_ADMIN'

// GET /api/admin/licenses — list issued licenses + entities (for the issue form's picker).
export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== SUPER) return NextResponse.json({ error: 'Super-admin only' }, { status: 403 })

  const { data: licenses, error } = await ctx.supabase
    .from('licenses')
    .select('id, lic_id, entity_id, machine_id, tier, label, issued_at, expires_at, is_active')
    .order('issued_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Only RETAILER entities are licensable — the desktop POS (the thing a .lic activates)
  // is retailer-only; wholesalers/distributors/etc. are web-only.
  const { data: entities } = await ctx.supabase
    .from('entities').select('id, name, tpn_gstin').eq('role', 'RETAILER').order('name')

  // Pending terminal self-registrations (machine_id captured from a new POS on first start).
  const { data: requests } = await ctx.supabase
    .from('license_requests')
    .select('id, machine_id, hostname, app_version, requested_at')
    .eq('status', 'PENDING')
    .order('requested_at', { ascending: false })

  return NextResponse.json({ licenses: licenses || [], entities: entities || [], requests: requests || [] })
}

// POST /api/admin/licenses — issue a signed .lic for a (store, machine). Also mints the
// per-terminal sync token embedded in the license (coupled activation + provisioning).
// The .lic is returned ONCE — it contains the plaintext sync token.
export async function POST(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== SUPER) return NextResponse.json({ error: 'Super-admin only' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const entityId = body.entity_id
  const machineId = (body.machine_id || '').trim()
  const tier = (body.tier || 'STANDARD').trim()
  const label = (body.label || '').trim() || null
  const days = Number(body.days) > 0 ? Math.floor(Number(body.days)) : 365
  if (!entityId || !machineId) {
    return NextResponse.json({ error: 'entity_id and machine_id are required' }, { status: 400 })
  }

  // The ingest URL is the cloud's OWN address — derived server-side so the admin never types
  // it. Priority: explicit override (rare) → NEXT_PUBLIC_APP_URL (the configured public URL) →
  // this request's own origin.
  let base = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '')
  if (!base) { try { base = new URL(request.url).origin } catch { base = '' } }
  const ingestUrl = (body.ingest_url || '').trim() || (base ? `${base}/api/sync/ingest` : '')
  if (!ingestUrl) {
    return NextResponse.json({ error: 'Cloud ingest URL not configured — set NEXT_PUBLIC_APP_URL on the server' }, { status: 500 })
  }

  const { data: entity } = await ctx.supabase.from('entities').select('id, name, role').eq('id', entityId).maybeSingle()
  if (!entity) return NextResponse.json({ error: 'Entity not found' }, { status: 400 })
  if (entity.role !== 'RETAILER') {
    return NextResponse.json({ error: 'Licenses can only be issued for RETAILER terminals (the desktop POS is retailer-only)' }, { status: 400 })
  }

  // 1. Mint the per-terminal sync token; store ONLY sha256 in terminal_tokens.
  const token = 'nxs_' + randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const { data: tok, error: tokErr } = await ctx.supabase
    .from('terminal_tokens')
    .insert({ entity_id: entityId, token_hash: tokenHash, label: label || `License — ${entity.name}`, created_by: ctx.userId })
    .select('id').single()
  if (tokErr) return NextResponse.json({ error: tokErr.message }, { status: 500 })

  // 2. Build + sign the .lic (carries entity + machine lock + sync token + ingest URL).
  const licId = randomUUID()
  const issuedAt = new Date().toISOString()
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString()
  let license
  try {
    license = buildLicense({
      lic_id: licId,
      entity_id: entityId,
      store_name: entity.name,
      machine_id: machineId,
      tier,
      issued_at: issuedAt,
      expires_at: expiresAt,
      sync: { ingest_url: ingestUrl, token },
    })
  } catch (e) {
    return NextResponse.json({ error: 'Signing failed: ' + e.message }, { status: 500 })
  }

  // 3. Record for revocation + audit (no plaintext token stored here).
  const { data: licRow, error: licErr } = await ctx.supabase.from('licenses').insert({
    lic_id: licId, entity_id: entityId, machine_id: machineId, token_id: tok.id,
    tier, label, issued_at: issuedAt, expires_at: expiresAt, created_by: ctx.userId,
  }).select('id').single()
  if (licErr) return NextResponse.json({ error: licErr.message }, { status: 500 })

  // Resolve any pending terminal self-registration for this machine.
  await ctx.supabase.from('license_requests')
    .update({ status: 'ISSUED', license_id: licRow.id, updated_at: new Date().toISOString() })
    .eq('machine_id', machineId)

  const safeName = entity.name.replace(/[^A-Za-z0-9]+/g, '_')
  return NextResponse.json(
    { license, filename: `${safeName}-${machineId.slice(0, 8)}.lic`, lic_id: licId, expires_at: expiresAt },
    { status: 201 },
  )
}
