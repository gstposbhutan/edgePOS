import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// PATCH /api/admin/users/[id] — SUPER_ADMIN: change sub_role and/or suspend/reactivate.
const SUB_ROLES = ['OWNER', 'MANAGER', 'CASHIER', 'STAFF']
const BAN_FOREVER = '876000h' // ~100 years

export async function PATCH(request, { params }) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Super-admin only' }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  // sub_role change → update profile + keep the auth user_metadata claim in sync
  if (body.sub_role !== undefined) {
    if (!SUB_ROLES.includes(body.sub_role)) {
      return NextResponse.json({ error: `sub_role must be one of: ${SUB_ROLES.join(', ')}` }, { status: 400 })
    }
    const { error } = await ctx.supabase.from('user_profiles').update({ sub_role: body.sub_role }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const { data: cur } = await ctx.supabase.auth.admin.getUserById(id)
    await ctx.supabase.auth.admin.updateUserById(id, {
      user_metadata: { ...(cur?.user?.user_metadata || {}), sub_role: body.sub_role },
    })
  }

  // per-user email-notification opt-in (super-admin can toggle for any user)
  if (body.email_notifications_enabled !== undefined) {
    const { error } = await ctx.supabase
      .from('user_profiles')
      .update({ email_notifications_enabled: !!body.email_notifications_enabled })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // suspend / reactivate via auth ban
  if (body.suspended !== undefined) {
    const { error } = await ctx.supabase.auth.admin.updateUserById(id, {
      ban_duration: body.suspended ? BAN_FOREVER : 'none',
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
