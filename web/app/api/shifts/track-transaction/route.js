import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function getAuthContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const entityId = user.app_metadata?.entity_id
  if (!entityId) return null

  const serviceClient = createServiceClient()
  return { entityId, supabase: serviceClient }
}

// POST /api/shifts/track-transaction
export async function POST(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { entityId, supabase } = ctx
  const body = await request.json()

  const { order_id, transaction_type, payment_method, amount } = body

  if (!transaction_type || !payment_method || amount === undefined) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Find active shift for this entity
  const { data: shift } = await supabase
    .from('shifts')
    .select('id')
    .eq('entity_id', entityId)
    .eq('status', 'ACTIVE')
    .maybeSingle()

  if (!shift) {
    // No active shift — silently skip (MANAGER/OWNER may not require shifts)
    return NextResponse.json({ tracked: false, reason: 'No active shift' })
  }

  const { error } = await supabase
    .from('shift_transactions')
    .insert({
      shift_id: shift.id,
      order_id: order_id || null,
      transaction_type,
      payment_method,
      amount: parseFloat(amount),
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ tracked: true })
}
