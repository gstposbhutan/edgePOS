import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

const VALID_TRANSITIONS = {
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['DELIVERED'],
  DELIVERED: ['COMPLETED'],
}

/** GET /api/wholesale/orders/[id] — order detail */
export async function GET(request, { params }) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { entityId, supabase } = ctx

  const { data: order, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .eq('order_type', 'WHOLESALE')
    .single()

  if (error || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  // Verify access: must be seller or buyer
  if (order.seller_id !== entityId && order.buyer_id !== entityId) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // Fetch items
  const { data: items } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', id)
    .order('created_at')

  // Fetch timeline
  const { data: timeline } = await supabase
    .from('order_status_log')
    .select('*')
    .eq('order_id', id)
    .order('created_at')

  // Fetch counter-party name
  const counterId = order.seller_id === entityId ? order.buyer_id : order.seller_id
  const { data: counterEntity } = await supabase
    .from('entities')
    .select('id, name, whatsapp_no')
    .eq('id', counterId)
    .single()

  return NextResponse.json({
    order,
    items: items || [],
    timeline: timeline || [],
    counter_party: counterEntity || null,
  })
}

/** PATCH /api/wholesale/orders/[id] — status update (wholesaler only) */
export async function PATCH(request, { params }) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { entityId, role, userId, supabase } = ctx
  if (role !== 'WHOLESALER' && role !== 'DISTRIBUTOR') {
    return NextResponse.json({ error: 'Only wholesalers can update order status' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const { status: newStatus, reason } = body

  if (!newStatus) {
    return NextResponse.json({ error: 'status required' }, { status: 400 })
  }

  // Fetch current order
  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select('id, status, seller_id, order_no')
    .eq('id', id)
    .eq('order_type', 'WHOLESALE')
    .single()

  if (fetchErr || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  if (order.seller_id !== entityId) {
    return NextResponse.json({ error: 'Not your order' }, { status: 403 })
  }

  // Validate transition
  const allowed = VALID_TRANSITIONS[order.status] || []
  if (!allowed.includes(newStatus)) {
    return NextResponse.json(
      { error: `Cannot transition from ${order.status} to ${newStatus}. Allowed: ${allowed.join(', ') || 'none'}` },
      { status: 400 }
    )
  }

  // Update status
  const updates = { status: newStatus }
  if (newStatus === 'CANCELLED') {
    updates.cancelled_at = new Date().toISOString()
    updates.cancellation_reason = reason || null
  }
  if (newStatus === 'COMPLETED') {
    updates.completed_at = new Date().toISOString()
  }

  const { error: updateErr } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // Log status change
  await supabase
    .from('order_status_log')
    .insert({
      order_id: id,
      from_status: order.status,
      to_status: newStatus,
      actor_id: userId,
      actor_role: role,
      reason: reason || null,
    })

  return NextResponse.json({ success: true, status: newStatus })
}
