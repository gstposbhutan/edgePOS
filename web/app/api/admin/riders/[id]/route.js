import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServiceClient as createSSRServiceClient } from '@/lib/supabase/server'

function createBypassClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

async function getAdminUser(request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  const authClient = createSSRServiceClient()
  const { data: { user } } = await authClient.auth.getUser(token)
  if (!user) return null
  const supabase = createBypassClient()
  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'SUPER_ADMIN') return null
  return user
}

// PATCH — toggle active status or reset PIN
export async function PATCH(request, { params }) {
  try {
    const admin = await getAdminUser(request)
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body = await request.json()
    const supabase = createBypassClient()

    const updates = {}
    if (typeof body.is_active === 'boolean') updates.is_active = body.is_active
    if (typeof body.is_available === 'boolean') updates.is_available = body.is_available

    const { data: rider, error } = await supabase
      .from('riders')
      .update(updates)
      .eq('id', id)
      .select('id, name, is_active, is_available')
      .single()

    if (error) throw error
    return NextResponse.json({ rider })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
