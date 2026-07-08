import { createHash } from 'node:crypto'
import { getServiceClient } from '@/lib/supabase/server'

/**
 * Resolve the vendor entity behind a per-terminal Bearer token — the same auth the sync ingest and
 * bootstrap use. The store (entity_id) is resolved FROM THE TOKEN (sha256 → terminal_tokens), never
 * from the request, so a terminal can only ever act on its own store.
 *
 * Returns { supabase, entityId } on success, or { error, status } to return directly.
 */
export async function resolveTerminal(request) {
  const authz = request.headers.get('authorization') || ''
  const token = authz.startsWith('Bearer ') ? authz.slice(7).trim() : null
  if (!token) return { error: 'Missing terminal token', status: 401 }

  const supabase = getServiceClient()
  if (!supabase) return { error: 'Sync not configured', status: 503 }

  const tokenHash = createHash('sha256').update(token).digest('hex')
  const { data: cred, error } = await supabase
    .from('terminal_tokens')
    .select('id, entity_id')
    .eq('token_hash', tokenHash)
    .eq('is_active', true)
    .maybeSingle()
  if (error) return { error: 'Auth check failed', status: 500 }
  if (!cred) return { error: 'Invalid or inactive terminal token', status: 401 }

  return { supabase, entityId: cred.entity_id }
}
