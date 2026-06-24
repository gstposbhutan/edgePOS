import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// Cash drawer adjustments are a manager/owner action (cash pickups, deposits,
// drawer corrections) — mirrors desktop's useRequireRole(['owner','manager']).
const MANAGER_ROLES = ['MANAGER', 'OWNER', 'ADMIN']
const VALID_TYPES = ['CASH_IN', 'CASH_OUT']

// GET /api/cash-adjustments?shift_id=… — recent entries for a shift (newest first).
// If no shift_id, defaults to the entity's current ACTIVE shift.
export async function GET(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { entityId, subRole, supabase } = ctx
  if (!MANAGER_ROLES.includes(subRole)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  let shiftId = searchParams.get('shift_id')

  if (!shiftId) {
    const { data: active } = await supabase
      .from('shifts')
      .select('id')
      .eq('entity_id', entityId)
      .in('status', ['ACTIVE', 'CLOSING'])
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    shiftId = active?.id ?? null
  }

  let query = supabase
    .from('cash_adjustments')
    .select('id, shift_id, type, amount, reason, notes, created_by, created_at')
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (shiftId) query = query.eq('shift_id', shiftId)

  const { data: adjustments, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ adjustments: adjustments || [], shift_id: shiftId })
}

// POST /api/cash-adjustments — record a cash in/out against the ACTIVE shift.
// The shift is resolved server-side (never trusted from the body), so an entry can
// only attach to the store's open shift.
export async function POST(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { entityId, subRole, userId, supabase } = ctx
  if (!MANAGER_ROLES.includes(subRole)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const type = String(body.type || '').toUpperCase()
  const amount = parseFloat(body.amount)
  const reason = String(body.reason || '').trim()
  const notes = body.notes ? String(body.notes).trim() : null

  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Type must be CASH_IN or CASH_OUT' }, { status: 400 })
  }
  if (isNaN(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
  }
  if (!reason) {
    return NextResponse.json({ error: 'Reason is required' }, { status: 400 })
  }

  // Resolve the active shift + its register (server-side truth).
  const { data: shift, error: shiftErr } = await supabase
    .from('shifts')
    .select('id, register_id')
    .eq('entity_id', entityId)
    .in('status', ['ACTIVE', 'CLOSING'])
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (shiftErr) return NextResponse.json({ error: shiftErr.message }, { status: 500 })
  if (!shift) {
    return NextResponse.json({ error: 'No active shift. Open a shift first.' }, { status: 409 })
  }

  const { data: adjustment, error } = await supabase
    .from('cash_adjustments')
    .insert({
      entity_id: entityId,
      shift_id: shift.id,
      register_id: shift.register_id,
      type,
      amount,
      reason,
      notes,
      created_by: userId,
    })
    .select('id, type, amount, reason, notes, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ adjustment }, { status: 201 })
}
