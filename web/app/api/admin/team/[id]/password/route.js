import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/**
 * POST /api/admin/team/[id]/password — owner resets a team member's password.
 * Updates the Supabase password (web login); the terminal mirrors the new bcrypt
 * hash on its next bootstrap, so the same new password works on the terminal too.
 */
export async function POST(request, { params }) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.subRole !== 'OWNER') {
    return NextResponse.json({ error: 'Only owners can reset team passwords' }, { status: 403 })
  }

  const { id } = await params
  const { password } = await request.json()
  if (!password || String(password).length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
  }

  // Target must belong to the owner's store.
  const { data: target } = await ctx.supabase
    .from('user_profiles').select('id, entity_id').eq('id', id).single()
  if (!target || target.entity_id !== ctx.entityId) {
    return NextResponse.json({ error: 'Team member not found' }, { status: 404 })
  }

  const { error } = await ctx.supabase.auth.admin.updateUserById(id, { password })
  if (error) return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 })

  return NextResponse.json({ success: true })
}
