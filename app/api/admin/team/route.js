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
  if (!entityId) return null

  return { entityId, subRole, supabase }
}

/** GET /api/admin/team — list all team members */
export async function GET(request) {
  const ctx = await getContext(request)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { entityId, supabase } = ctx
  const { data: profiles, error } = await supabase
    .from('user_profiles')
    .select('id, full_name, sub_role, permissions, created_at')
    .eq('entity_id', entityId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get emails from auth.users
  const { data: { users } } = await supabase.auth.admin.listUsers()
  const emailMap = Object.fromEntries(users.map(u => [u.id, u.email]))

  const team = (profiles || []).map(p => ({
    ...p,
    email: emailMap[p.id] || '',
  }))

  return NextResponse.json({ team })
}

/** POST /api/admin/team — create a new team member */
export async function POST(request) {
  const ctx = await getContext(request)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.subRole !== 'OWNER') {
    return NextResponse.json({ error: 'Only owners can add team members' }, { status: 403 })
  }

  const body = await request.json()
  const { email, password, full_name, sub_role } = body

  if (!email || !password || !full_name || !sub_role) {
    return NextResponse.json({ error: 'email, password, full_name, and sub_role are required' }, { status: 400 })
  }
  if (!['MANAGER', 'STAFF'].includes(sub_role)) {
    return NextResponse.json({ error: 'sub_role must be MANAGER or STAFF' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
  }

  const { entityId, supabase } = ctx
  const permissions = PERMISSIONS_BY_ROLE[sub_role] || []

  // Create auth user
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
    app_metadata: {
      role: 'WHOLESALER',
      sub_role,
      entity_id: entityId,
      permissions,
    },
  })

  if (authErr) {
    if (authErr.message?.includes('already registered')) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }

  // Create user profile
  const { data: profile, error: profileErr } = await supabase
    .from('user_profiles')
    .insert({
      id: authData.user.id,
      entity_id: entityId,
      role: 'WHOLESALER',
      sub_role,
      full_name: full_name.trim(),
      permissions,
    })
    .select('id, full_name, sub_role, permissions, created_at')
    .single()

  if (profileErr) {
    await supabase.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 })
  }

  return NextResponse.json({ member: { ...profile, email: email.trim().toLowerCase() } }, { status: 201 })
}
