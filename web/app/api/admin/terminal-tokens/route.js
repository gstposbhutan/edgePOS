import { NextResponse } from 'next/server'
import { randomBytes, createHash } from 'node:crypto'
import { getAuthContext } from '@/lib/supabase/server'

const ADMIN_ROLES = ['MANAGER', 'OWNER', 'ADMIN']

// GET /api/admin/terminal-tokens — list this entity's tokens. NEVER the secret:
// only sha256 is stored, and it's not returned. Shows label / register / status.
export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ADMIN_ROLES.includes(ctx.subRole)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { data, error } = await ctx.supabase
    .from('terminal_tokens')
    .select('id, label, register_id, is_active, last_seen_at, created_at')
    .eq('entity_id', ctx.entityId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tokens: data || [] })
}

// POST /api/admin/terminal-tokens — issue a token for THIS admin's store.
// Returns the plaintext token EXACTLY ONCE; the cloud keeps only sha256(token).
export async function POST(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ADMIN_ROLES.includes(ctx.subRole)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const label = (body.label || '').trim() || null
  const registerId = body.register_id || null

  // A named register must belong to THIS store (entity comes from the session, never the body).
  if (registerId) {
    const { data: reg } = await ctx.supabase
      .from('cash_registers')
      .select('id')
      .eq('id', registerId)
      .eq('entity_id', ctx.entityId)
      .maybeSingle()
    if (!reg) return NextResponse.json({ error: 'Register not found for this store' }, { status: 400 })
  }

  // High-entropy secret. The "nxs_" prefix aids recognition / secret-scanning.
  const token = 'nxs_' + randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')

  const { data, error } = await ctx.supabase
    .from('terminal_tokens')
    .insert({
      entity_id: ctx.entityId,
      register_id: registerId,
      token_hash: tokenHash,
      label,
      created_by: ctx.userId,
    })
    .select('id, label, register_id, is_active, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // `token` is shown ONCE — it cannot be retrieved again. Enter it on the terminal
  // (Settings → sync API key). Lost tokens are revoked + re-issued, not recovered.
  return NextResponse.json({ token, record: data }, { status: 201 })
}
