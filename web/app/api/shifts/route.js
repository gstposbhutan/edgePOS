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

  // Use service client for queries (bypasses RLS)
  const serviceClient = createServiceClient()
  return { entityId, subRole, userId, supabase: serviceClient }
}

// GET /api/shifts — current active shift
export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { entityId, subRole, userId, supabase } = ctx

  // Find active shift for this entity
  const { data: shift, error } = await supabase
    .from('shifts')
    .select('id, register_id, opened_by, opening_float, status, opened_at, cash_registers(name)')
    .eq('entity_id', entityId)
    .in('status', ['ACTIVE', 'CLOSING'])
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!shift) return NextResponse.json({ shift: null })

  // Get transaction count
  const { count } = await supabase
    .from('shift_transactions')
    .select('*', { count: 'exact', head: true })
    .eq('shift_id', shift.id)

  const result = {
    shift: {
      id: shift.id,
      register_id: shift.register_id,
      register_name: shift.cash_registers?.name,
      opened_by: shift.opened_by,
      opening_float: shift.opening_float,
      status: shift.status,
      opened_at: shift.opened_at,
      transaction_count: count || 0,
    },
  }

  // MANAGER/OWNER get running totals
  if (['MANAGER', 'OWNER', 'ADMIN'].includes(subRole)) {
    const { data: txns } = await supabase
      .from('shift_transactions')
      .select('transaction_type, payment_method, amount')
      .eq('shift_id', shift.id)

    const totals = { cash_sales: 0, digital_sales: 0, cash_refunds: 0, voids: 0 }
    for (const t of txns || []) {
      if (t.transaction_type === 'SALE') {
        if (t.payment_method === 'CASH') totals.cash_sales += parseFloat(t.amount)
        else totals.digital_sales += parseFloat(t.amount)
      } else if (t.transaction_type === 'REFUND') {
        if (t.payment_method === 'CASH') totals.cash_refunds += parseFloat(t.amount)
      } else if (t.transaction_type === 'VOID') {
        totals.voids += 1
      }
    }
    result.shift.running_totals = totals
  }

  return NextResponse.json(result)
}
