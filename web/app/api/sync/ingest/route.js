import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { getServiceClient } from '@/lib/supabase/server'
import { syncTerminalBatch } from '@nexus-bhutan/sync-core'

// --- Abuse limits (the endpoint is authenticated, but a buggy/compromised terminal
// must not be able to exhaust memory or hammer the DB) -------------------------------
const MAX_BODY_BYTES = 5 * 1024 * 1024   // 5 MB — a real terminal batch is far smaller.
const MAX_ROWS = 5000                    // per-collection row cap per push.
const RATE_LIMIT = { windowMs: 60_000, max: 60 }  // requests per token per minute.

// Best-effort in-memory rate limiter, keyed by token hash. NOTE: per-INSTANCE only —
// in a multi-instance deploy, back this with Redis/Upstash or a DB counter. It still
// throttles a single misbehaving terminal pinned to one instance. Keyed by the hash
// (not the secret), and only expired buckets are kept around.
const rateBuckets = new Map()
function rateLimited(key, now) {
  const existing = rateBuckets.get(key)
  if (existing && now > existing.resetAt) rateBuckets.delete(key)
  const bucket = rateBuckets.get(key)
  if (!bucket) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT.windowMs })
    return false
  }
  bucket.count += 1
  return bucket.count > RATE_LIMIT.max
}

/**
 * Terminal → cloud sync ingest (transport/auth layer).
 *
 * TOPOLOGY: terminals are offline-first and behind NAT, so they PUSH. A terminal
 * assembles a batch of its unsynced PocketBase rows and POSTs it here.
 *
 * AUTH: a per-terminal bearer token (one per provisioned register). The cloud
 * stores only sha256(token) in terminal_tokens; the plaintext lives on the terminal
 * (its sync API key). The store (entity_id) is resolved FROM THE TOKEN — never from
 * the request body — so a terminal can only ever push into its own store, no matter
 * what it sends.
 *
 * IDEMPOTENCY: the whole batch is idempotent (registers by machine_id, orders by
 * order_no, movements/khata by external_id — all upsert / DO NOTHING / apply-once),
 * so a terminal may safely re-push a batch whose "mark synced" step failed. The
 * service-role client is used ONLY after the token is validated.
 */
export async function POST(request) {
  // 1. Extract the bearer token.
  const authz = request.headers.get('authorization') || ''
  const token = authz.startsWith('Bearer ') ? authz.slice(7).trim() : null
  if (!token) return NextResponse.json({ error: 'Missing terminal token' }, { status: 401 })

  // Cheap early rejection of oversized pushes (before any DB work).
  const declaredLen = Number(request.headers.get('content-length') || 0)
  if (declaredLen && declaredLen > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  const supabase = getServiceClient()
  if (!supabase) return NextResponse.json({ error: 'Sync not configured' }, { status: 503 })

  // 2. Validate it. We compare sha256(token) — a high-entropy random token doesn't
  //    need a slow hash, and constant lookup by hash avoids storing the secret.
  const tokenHash = createHash('sha256').update(token).digest('hex')

  // Throttle per token (best-effort, in-memory). Runs before the DB lookup so a flood
  // from one terminal can't hammer the auth query either.
  if (rateLimited(tokenHash, Date.now())) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } })
  }

  const { data: cred, error: credError } = await supabase
    .from('terminal_tokens')
    .select('id, entity_id, register_id, created_by')
    .eq('token_hash', tokenHash)
    .eq('is_active', true)
    .maybeSingle()
  if (credError) return NextResponse.json({ error: 'Auth check failed' }, { status: 500 })
  if (!cred) return NextResponse.json({ error: 'Invalid or inactive terminal token' }, { status: 401 })

  // 3. Parse the batch. entity_id comes from the TOKEN — any body-supplied entity is ignored.
  let body
  try {
    const raw = await request.text()
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
    }
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const batch = {
    entityId: cred.entity_id,
    // The admin who issued this token is the preferred actor for synced khata txns
    // (terminal cashiers aren't cloud users). The RPC falls back to the entity owner.
    actorId: cred.created_by ?? null,
    machineId: typeof body.machineId === 'string' ? body.machineId : '',
    registers: Array.isArray(body.registers) ? body.registers : [],
    orders: Array.isArray(body.orders) ? body.orders : [],
    products: Array.isArray(body.products) ? body.products : [],
    movements: Array.isArray(body.movements) ? body.movements : [],
    khataAccounts: Array.isArray(body.khataAccounts) ? body.khataAccounts : [],
    khataTxns: Array.isArray(body.khataTxns) ? body.khataTxns : [],
  }

  // Cap per-collection row counts — a single push must stay bounded.
  const overCap = [
    batch.registers, batch.orders, batch.products,
    batch.movements, batch.khataAccounts, batch.khataTxns,
  ].some((arr) => arr.length > MAX_ROWS)
  if (overCap) return NextResponse.json({ error: 'Batch too large' }, { status: 413 })

  // 4. Reconcile (registers → orders → movements → khata). Idempotent, so a retry is safe.
  let result
  try {
    result = await syncTerminalBatch(supabase, batch)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reconciliation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  // 5. Liveness marker (best-effort).
  await supabase
    .from('terminal_tokens')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', cred.id)

  // The terminal marks its pushed rows synced on a 200. `received` lets it confirm
  // counts; a future response would echo the applied/duplicate breakdown from `result`.
  return NextResponse.json({
    ok: true,
    entityId: cred.entity_id,
    received: {
      registers: batch.registers.length,
      orders: batch.orders.length,
      movements: batch.movements.length,
      khataAccounts: batch.khataAccounts.length,
      khataTxns: batch.khataTxns.length,
    },
    result,
  })
}
