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
  const subRole = user.app_metadata?.sub_role
  const userId = user.id
  if (!entityId) return null

  return { entityId, subRole, userId, supabase }
}

// GET /api/shifts/history
export async function GET(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { entityId, subRole, userId, supabase } = ctx
  const { searchParams } = new URL(request.url)

  let query = supabase
    .from('shifts')
    .select('id, register_id, opened_by, closed_by, opening_float, closing_count, expected_total, discrepancy, status, opened_at, closed_at, cash_registers(name), shift_reconciliations(classification)')
    .eq('entity_id', entityId)
    .eq('status', 'CLOSED')
    .order('closed_at', { ascending: false })
    .limit(50)

  // CASHIER sees own shifts only
  if (subRole === 'CASHIER') {
    query = query.eq('opened_by', userId)
  }

  const { data: shifts, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = shifts.map(s => ({
    id: s.id,
    register_name: s.cash_registers?.name,
    opened_by: s.opened_by,
    closed_by: s.closed_by,
    opening_float: s.opening_float,
    closing_count: s.closing_count,
    opened_at: s.opened_at,
    closed_at: s.closed_at,
  }))

  // Add reconciliation data for MANAGER/OWNER
  if (['MANAGER', 'OWNER', 'ADMIN'].includes(subRole)) {
    for (const s of shifts) {
      const match = result.find(r => r.id === s.id)
      if (match) {
        match.expected_total = s.expected_total
        match.discrepancy = s.discrepancy
        match.classification = s.shift_reconciliations?.[0]?.classification
      }
    }
  }

  return NextResponse.json({ shifts: result })
}
