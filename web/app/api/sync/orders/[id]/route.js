import { NextResponse } from 'next/server'
import { resolveTerminal } from '@/lib/sync/terminal-auth'
import { assignOrderToRider } from '@/lib/riders/dispatch'

/**
 * POST /api/sync/orders/[id] — vendor acts on one of their ONLINE orders from the terminal.
 * Body: { action: 'confirm' | 'cancel', reason? }. Auth: per-terminal Bearer token; the order must
 * belong to the token's store. Mirrors the web vendor transitions (CONFIRMED→PROCESSING / →CANCELLED).
 */
const ALLOWED = {
  CONFIRMED:  ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['CANCELLED'],
}

export async function POST(request, { params }) {
  const t = await resolveTerminal(request)
  if (t.error) return NextResponse.json({ error: t.error }, { status: t.status })
  const { supabase, entityId } = t

  const { id } = await params
  const { action, reason } = await request.json()
  const target = action === 'confirm' ? 'PROCESSING' : action === 'cancel' ? 'CANCELLED' : null
  if (!target) return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  const { data: order } = await supabase
    .from('orders')
    .select('id, order_no, status, seller_id')
    .eq('id', id)
    .eq('order_type', 'MARKETPLACE')
    .maybeSingle()
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.seller_id !== entityId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!(ALLOWED[order.status] || []).includes(target)) {
    return NextResponse.json({ error: `Cannot ${action} from ${order.status}` }, { status: 400 })
  }

  const update = { status: target }
  if (target === 'CANCELLED') {
    update.cancelled_at = new Date().toISOString()
    update.cancellation_reason = reason?.trim() || 'Cancelled by vendor'
    update.rider_id = null
    update.dispatch_state = null
  }

  const { error } = await supabase.from('orders').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Confirming a delivery order (re-)drives rider assignment; idempotent if it already has one.
  if (target === 'PROCESSING') await assignOrderToRider(supabase, id)

  return NextResponse.json({ success: true, status: target })
}
