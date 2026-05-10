import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const OWNER_PERMISSIONS = [
  'pos:sale', 'inventory:read', 'inventory:write',
  'orders:read', 'orders:write', 'reports:read', 'reports:export',
  'users:read', 'users:write', 'settings:read', 'settings:write',
  'khata:read', 'khata:write',
]

const PERMISSIONS_BY_ROLE = {
  OWNER:   OWNER_PERMISSIONS,
  MANAGER: ['inventory:read', 'inventory:write', 'orders:read', 'orders:write', 'reports:read', 'khata:read'],
  CASHIER: ['orders:read', 'orders:write'],
  STAFF:   ['orders:read', 'orders:write'],
}

async function getContext(request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null

  const supabase = createServiceClient()
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return null

  const entityId = user.user_metadata?.entity_id || user.app_metadata?.entity_id
  const subRole  = user.user_metadata?.sub_role  || user.app_metadata?.sub_role
  const role     = user.user_metadata?.role       || user.app_metadata?.role
  if (!entityId) return null

  return { entityId, subRole, role, userId: user.id, supabase }
}

/** PATCH /api/admin/team/[id] — update sub_role or transfer ownership */
export async function PATCH(request, { params }) {
  const ctx = await getContext(request)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.subRole !== 'OWNER') {
    return NextResponse.json({ error: 'Only owners can edit team members' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const { entityId, userId, role, supabase } = ctx

  // Cannot edit yourself via this endpoint (use profile page)
  if (id === userId) {
    return NextResponse.json({ error: 'Cannot edit your own role here' }, { status: 400 })
  }

  // Verify target belongs to same entity
  const { data: target } = await supabase
    .from('user_profiles')
    .select('id, entity_id, sub_role')
    .eq('id', id)
    .single()

  if (!target || target.entity_id !== entityId) {
    return NextResponse.json({ error: 'Team member not found' }, { status: 404 })
  }

  const newSubRole = body.sub_role
  if (!['OWNER', 'MANAGER', 'CASHIER', 'STAFF'].includes(newSubRole)) {
    return NextResponse.json({ error: 'Invalid sub_role' }, { status: 400 })
  }

  const newPermissions = PERMISSIONS_BY_ROLE[newSubRole] || []

  // Ownership transfer — demote current owner to MANAGER first
  if (newSubRole === 'OWNER') {
    await supabase
      .from('user_profiles')
      .update({ sub_role: 'MANAGER', permissions: PERMISSIONS_BY_ROLE.MANAGER })
      .eq('id', userId)

    await supabase.auth.admin.updateUserById(userId, {
      user_metadata: { sub_role: 'MANAGER', permissions: PERMISSIONS_BY_ROLE.MANAGER },
    })

    // Update owner_stores to point to new owner
    await supabase
      .from('owner_stores')
      .update({ owner_id: id })
      .eq('owner_id', userId)
      .eq('entity_id', entityId)
  }

  // Update target member
  const { data, error } = await supabase
    .from('user_profiles')
    .update({ sub_role: newSubRole, permissions: newPermissions })
    .eq('id', id)
    .select('id, full_name, sub_role, permissions')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.auth.admin.updateUserById(id, {
    user_metadata: {
      role,
      sub_role: newSubRole,
      entity_id: entityId,
      permissions: newPermissions,
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

  const { data: target } = await supabase
    .from('user_profiles')
    .select('id, entity_id, sub_role')
    .eq('id', id)
    .single()

  if (!target || target.entity_id !== entityId) {
    return NextResponse.json({ error: 'Team member not found' }, { status: 404 })
  }

  if (target.sub_role === 'OWNER') {
    return NextResponse.json({ error: 'Cannot remove another OWNER. Transfer ownership first.' }, { status: 400 })
  }

  await supabase.from('user_profiles').delete().eq('id', id)
  await supabase.auth.admin.deleteUser(id)

  return NextResponse.json({ success: true })
}
