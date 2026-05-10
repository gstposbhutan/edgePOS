import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'

async function getAuthContext() {
  const cookieStore = await cookies()
  const supabase = createServiceClient()

  const accessToken = cookieStore.get('sb-access-token')?.value
    || cookieStore.get('supabase-auth-token')?.value
  if (!accessToken) return null

  const { data: { user } } = await supabase.auth.getUser(accessToken)
  if (!user) return null

  const entityId = user.app_metadata?.entity_id
  if (!entityId) return null

  return { entityId, supabase }
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
