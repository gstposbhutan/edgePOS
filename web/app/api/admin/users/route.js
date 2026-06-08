import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// SUPER_ADMIN global user management — create/list users across ANY entity (the central
// "super admin creates all users and roles"). Complements the entity-scoped /api/admin/team.
const SUPER = 'SUPER_ADMIN'
const SUB_ROLES = ['OWNER', 'MANAGER', 'CASHIER', 'STAFF']
const OWNER_PERMISSIONS = [
  'pos:sale', 'inventory:read', 'inventory:write', 'orders:read', 'orders:write',
  'reports:read', 'reports:export', 'users:read', 'users:write', 'settings:read', 'settings:write',
  'khata:read', 'khata:write',
]
const PERMISSIONS_BY_SUBROLE = {
  OWNER: OWNER_PERMISSIONS,
  MANAGER: ['inventory:read', 'inventory:write', 'orders:read', 'orders:write', 'reports:read', 'khata:read'],
  CASHIER: ['pos:sale', 'orders:read', 'orders:write'],
  STAFF: ['orders:read', 'orders:write'],
}

// GET — list ALL users (across every entity) + entities (for the onboard picker).
export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== SUPER) return NextResponse.json({ error: 'Super-admin only' }, { status: 403 })

  const { data: profiles, error } = await ctx.supabase
    .from('user_profiles')
    .select('id, full_name, role, sub_role, entity_id, created_at')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: authList } = await ctx.supabase.auth.admin.listUsers()
  const authMap = Object.fromEntries((authList?.users || []).map((u) => [u.id, u]))
  const { data: entities } = await ctx.supabase.from('entities').select('id, name, role').order('name')
  const nameMap = Object.fromEntries((entities || []).map((e) => [e.id, e.name]))

  return NextResponse.json({
    users: (profiles || []).map((p) => {
      const au = authMap[p.id]
      const banned = !!(au?.banned_until && new Date(au.banned_until) > new Date())
      return { ...p, email: au?.email || '', entity_name: nameMap[p.entity_id] || '', banned }
    }),
    entities: entities || [],
  })
}

// POST — onboard a user into ANY entity. The user's platform `role` mirrors the entity's
// role; `sub_role` is the within-entity role (OWNER/MANAGER/CASHIER/STAFF).
export async function POST(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== SUPER) return NextResponse.json({ error: 'Super-admin only' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const entityId = body.entity_id
  const email = (body.email || '').trim().toLowerCase()
  const password = body.password || ''
  const fullName = (body.full_name || '').trim()
  const subRole = (body.sub_role || 'OWNER').trim()
  if (!entityId || !email || !password || !fullName) {
    return NextResponse.json({ error: 'entity_id, email, password and full_name are required' }, { status: 400 })
  }
  if (!SUB_ROLES.includes(subRole)) return NextResponse.json({ error: `sub_role must be one of: ${SUB_ROLES.join(', ')}` }, { status: 400 })
  if (password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })

  const { data: entity } = await ctx.supabase.from('entities').select('id, role').eq('id', entityId).maybeSingle()
  if (!entity) return NextResponse.json({ error: 'Entity not found' }, { status: 400 })
  const role = entity.role
  const permissions = PERMISSIONS_BY_SUBROLE[subRole] || []

  const { data: authData, error: authErr } = await ctx.supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role, sub_role: subRole, entity_id: entityId, permissions, full_name: fullName },
  })
  if (authErr) {
    if (authErr.message?.includes('already registered')) return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }

  const { data: profile, error: profErr } = await ctx.supabase
    .from('user_profiles')
    .insert({ id: authData.user.id, entity_id: entityId, role, sub_role: subRole, full_name: fullName, permissions })
    .select('id, full_name, role, sub_role, entity_id')
    .single()
  if (profErr) {
    await ctx.supabase.auth.admin.deleteUser(authData.user.id) // roll back the auth user
    return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 })
  }

  return NextResponse.json({ user: { ...profile, email } }, { status: 201 })
}
