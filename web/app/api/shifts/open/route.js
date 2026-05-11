import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function getAuthContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const entityId = user.app_metadata?.entity_id
  const subRole = user.app_metadata?.sub_role
  const userId = user.id
  if (!entityId) return null

  const serviceClient = createServiceClient()
  return { entityId, subRole, userId, supabase: serviceClient }
}

// POST /api/shifts/open
export async function POST(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { entityId, userId, supabase } = ctx
  const body = await request.json()

  const register_id = body.register_id
  const opening_float = parseFloat(body.opening_float)

  if (!register_id) return NextResponse.json({ error: 'Register is required' }, { status: 400 })
  if (isNaN(opening_float) || opening_float < 0) return NextResponse.json({ error: 'Opening float must be >= 0' }, { status: 400 })

  // Validate register belongs to entity and is active
  const { data: reg } = await supabase
    .from('cash_registers')
    .select('id, name')
    .eq('id', register_id)
    .eq('entity_id', entityId)
    .eq('is_active', true)
    .maybeSingle()

  if (!reg) return NextResponse.json({ error: 'Invalid or inactive register' }, { status: 400 })

  // Check no active shift on this register
  const { data: existing } = await supabase
    .from('shifts')
    .select('id')
    .eq('register_id', register_id)
    .in('status', ['ACTIVE', 'CLOSING'])
    .maybeSingle()

  if (existing) return NextResponse.json({ error: 'A shift is already active on this register' }, { status: 409 })

  const { data: shift, error } = await supabase
    .from('shifts')
    .insert({
      entity_id: entityId,
      register_id,
      opened_by: userId,
      opening_float,
      status: 'ACTIVE',
    })
    .select('id, opened_at, status')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    shift: {
      shift_id: shift.id,
      opened_at: shift.opened_at,
      status: shift.status,
    },
  }, { status: 201 })
}
