import { NextResponse } from 'next/server'
import { randomBytes, createHash } from 'node:crypto'
import { getAuthContext } from '@/lib/supabase/server'
import { buildLicense } from '@/lib/license/sign'

// POST /api/cash-registers/[id]/license — the store OWNER/MANAGER (re)downloads the .lic key for one
// of their terminals. Each download RE-MINTS: it rotates the terminal's sync token (deactivating the
// previous one) and rebuilds a fresh .lic, so any earlier-downloaded key stops working and the
// terminal must re-activate with this one. Keeps the same lic_id/tier/expiry — this is a key rotation,
// not a new license. Super-admin issuance/approval is unchanged; this only re-issues an ALREADY
// approved (active) license.
export async function POST(request, { params }) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { entityId, subRole, userId, supabase } = ctx
  if (!['MANAGER', 'OWNER', 'ADMIN'].includes(subRole)) {
    return NextResponse.json({ error: 'Only a manager or owner can download a terminal license key' }, { status: 403 })
  }
  const { id } = await params

  // The register (terminal), scoped to the caller's store.
  const { data: reg } = await supabase
    .from('cash_registers')
    .select('id, name, machine_id, mode')
    .eq('id', id).eq('entity_id', entityId)
    .maybeSingle()
  if (!reg) return NextResponse.json({ error: 'Register not found' }, { status: 404 })
  if (!reg.machine_id) return NextResponse.json({ error: 'This register is not a licensed terminal' }, { status: 400 })

  // Its bound license (must exist and be active — approval is a super-admin step).
  const { data: lic } = await supabase
    .from('licenses')
    .select('id, lic_id, machine_id, tier, issued_at, expires_at, token_id, is_active')
    .eq('register_id', id).eq('entity_id', entityId)
    .order('issued_at', { ascending: false })
    .maybeSingle()
  if (!lic) return NextResponse.json({ error: 'No license has been approved for this terminal yet' }, { status: 404 })
  if (!lic.is_active) return NextResponse.json({ error: 'This terminal’s license has been revoked' }, { status: 403 })

  const { data: entity } = await supabase.from('entities').select('name').eq('id', entityId).maybeSingle()

  // Ingest URL — derived server-side (same rule as issuance): configured public URL, else this origin.
  let base = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '')
  if (!base) { try { base = new URL(request.url).origin } catch { base = '' } }
  const ingestUrl = base ? `${base}/api/sync/ingest` : ''
  if (!ingestUrl) return NextResponse.json({ error: 'Cloud ingest URL not configured' }, { status: 500 })

  // Rotate the sync token: deactivate the old, mint a new one bound to this register.
  if (lic.token_id) await supabase.from('terminal_tokens').update({ is_active: false }).eq('id', lic.token_id)
  const token = 'nxs_' + randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const { data: tok, error: tokErr } = await supabase
    .from('terminal_tokens')
    .insert({ entity_id: entityId, register_id: id, token_hash: tokenHash, label: `License — ${reg.name}`, created_by: userId })
    .select('id').single()
  if (tokErr) return NextResponse.json({ error: tokErr.message }, { status: 500 })

  let license
  try {
    license = buildLicense({
      lic_id: lic.lic_id,
      entity_id: entityId,
      store_name: entity?.name || '',
      machine_id: lic.machine_id || reg.machine_id,
      register_id: id,
      mode: reg.mode || 'POS',
      tier: lic.tier,
      issued_at: lic.issued_at,
      expires_at: lic.expires_at,
      sync: { ingest_url: ingestUrl, token },
    })
  } catch (e) {
    return NextResponse.json({ error: 'Signing failed: ' + e.message }, { status: 500 })
  }

  // Point the license row at the new token.
  await supabase.from('licenses').update({ token_id: tok.id }).eq('id', lic.id)

  const safeName = (entity?.name || 'terminal').replace(/[^A-Za-z0-9]+/g, '_')
  const machine = lic.machine_id || reg.machine_id
  return NextResponse.json({ license, filename: `${safeName}-${machine.slice(0, 8)}.lic` })
}
