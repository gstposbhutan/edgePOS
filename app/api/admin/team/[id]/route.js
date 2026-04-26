import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const PERMISSIONS_BY_ROLE = {
  MANAGER: ['inventory:read', 'inventory:write', 'orders:read', 'orders:write', 'reports:read', 'khata:read'],
  STAFF: ['orders:read', 'orders:write'],
}

async function getContext(request) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return null

  const token = authHeader.replace('Bearer ', '')
  const supabase = createServiceClient()
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return null

  const entityId = user.app_metadata?.entity_id
  const subRole = user.app_metadata?.sub_role
  const userId = user.id
  if (!entityId) return null

  return { entityId, subRole, userId, supabase }
}

/** PATCH /api/admin/team/[id] — update sub_role/permissions */
export async function PATCH(request, { params }) {
  const ctx = await getContext(request)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.subRole !== 'OWNER') {
    return NextResponse.json({ error: 'Only owners can edit team members' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const { entityId, supabase } = ctx

  // Verify target belongs to same entity
  const { data: target } = await supabase
    .from('user_profiles')
    .select('id, entity_id, sub_role')
    .eq('id', id)
    .single()

  if (!target || target.entity_id !== entityId) {
    return NextResponse.json({ error: 'Team member not found' }, { status: 404 })
  }

  const updates = {}
  if (body.sub_role) {
    if (!['MANAGER', 'STAFF'].includes(body.sub_role)) {
      return NextResponse.json({ error: 'sub_role must be MANAGER or STAFF' }, { status: 400 })
    }
    updates.sub_role = body.sub_role
    updates.permissions = PERMISSIONS_BY_ROLE[body.sub_role] || []
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  // Update profile
  const { data, error } = await supabase
    .from('user_profiles')
    .update(updates)
    .eq('id', id)
    .select('id, full_name, sub_role, permissions')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update auth user app_metadata
  await supabase.auth.admin.updateUserById(id, {
    app_metadata: {
      sub_role: updates.sub_role,
      permissions: updates.permissions,
    },
  })

  return NextResponse.json({ member: data })
}

/** DELETE /api/admin/team/[id] — remove team member */
export async function DELETE(request, { params }) {
  const ctx = await getContext(request)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.subRole !== 'OWNER') {
    return NextResponse.json({ error: 'Only owners can remove team members' }, { status: 403 })
  }

  const { id } = await params
  const { entityId, userId, supabase } = ctx

  if (id === userId) {
    return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 })
  }

  // Verify target belongs to same entity
  const { data: target } = await supabase
    .from('user_profiles')
    .select('id, entity_id')
    .eq('id', id)
    .single()

  if (!target || target.entity_id !== entityId) {
    return NextResponse.json({ error: 'Team member not found' }, { status: 404 })
  }

  // Delete profile (cascades) then auth user
  await supabase.from('user_profiles').delete().eq('id', id)
  await supabase.auth.admin.deleteUser(id)

  return NextResponse.json({ success: true })
}
