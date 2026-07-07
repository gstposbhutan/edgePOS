import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// PATCH /api/admin/entities/[id] — SUPER_ADMIN edits an entity (incl. suspend via is_active).
// Role is intentionally NOT editable here (changing an entity's role is sensitive).
export async function PATCH(request, { params }) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Super-admin only' }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const patch = {}
  for (const f of ['name', 'tpn_gstin', 'whatsapp_no', 'address']) {
    if (body[f] !== undefined) patch[f] = (typeof body[f] === 'string' ? body[f].trim() : body[f]) || null
  }
  if (body.credit_limit !== undefined) {
    patch.credit_limit = body.credit_limit != null && body.credit_limit !== '' ? Number(body.credit_limit) : null
  }
  if (body.is_active !== undefined) patch.is_active = !!body.is_active
  if (body.is_featured !== undefined) patch.is_featured = !!body.is_featured   // promote to the public catalog
  if (body.email_notifications_enabled !== undefined) patch.email_notifications_enabled = !!body.email_notifications_enabled
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const { data, error } = await ctx.supabase
    .from('entities')
    .update(patch)
    .eq('id', id)
    .select('id, name, role, tpn_gstin, whatsapp_no, address, credit_limit, is_active, is_featured, email_notifications_enabled')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
  return NextResponse.json({ entity: data })
}
