import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

const ADMIN_ROLES = ['MANAGER', 'OWNER', 'ADMIN']

// DELETE /api/admin/terminal-tokens/[id] — revoke a token (soft: is_active=false).
// Revocation is one-way; issue a fresh token to replace it. Entity-scoped so an
// admin can only revoke their own store's tokens.
export async function DELETE(request, { params }) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ADMIN_ROLES.includes(ctx.subRole)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { id } = await params
  const { data, error } = await ctx.supabase
    .from('terminal_tokens')
    .update({ is_active: false })
    .eq('id', id)
    .eq('entity_id', ctx.entityId)
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Token not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
