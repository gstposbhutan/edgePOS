import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

const PO_VALID_TRANSITIONS = {
  DRAFT: ['SENT', 'CANCELLED'],
  SENT:  ['PARTIALLY_RECEIVED', 'CANCELLED'],
}

// GET — single PO or Invoice detail
export async function GET(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const { entityId, supabase } = ctx

    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        id, order_no, order_type, status, grand_total, gst_total, subtotal,
        payment_method, supplier_name, supplier_ref, expected_delivery,
        purchase_order_id, received_at, created_at, updated_at, cancelled_at,
        buyer_id, seller_id,
        seller:entities!seller_id(id, name, whatsapp_no, tpn_gstin)
      `)
      .eq('id', id)
      .in('order_type', ['PURCHASE_ORDER', 'PURCHASE_INVOICE'])
      .single()

    if (error || !order) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    if (order.buyer_id !== entityId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: items } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', id)
      .order('id')

    const { data: timeline } = await supabase
      .from('order_status_log')
      .select('*')
      .eq('order_id', id)
      .order('created_at')

    // Fetch related invoices for POs
    let relatedInvoices = []
    if (order.order_type === 'PURCHASE_ORDER') {
      const { data: invoices } = await supabase
        .from('orders')
        .select('id, order_no, status, grand_total, created_at')
        .eq('purchase_order_id', id)
        .eq('order_type', 'PURCHASE_INVOICE')
        .order('created_at', { ascending: false })
      relatedInvoices = invoices || []
    }

    return NextResponse.json({ order, items: items || [], timeline: timeline || [], relatedInvoices })

  } catch (error) {
    console.error('[purchases/[id] GET]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH — update PO status (DRAFT→SENT, SENT→CANCELLED, etc.)
export async function PATCH(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const { entityId, supabase } = ctx
    const { status: newStatus, reason } = await request.json()

    if (!newStatus) return NextResponse.json({ error: 'status is required' }, { status: 400 })

    const { data: order } = await supabase
      .from('orders')
      .select('id, status, order_type, buyer_id')
      .eq('id', id)
      .single()

    if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (order.buyer_id !== entityId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const allowed = PO_VALID_TRANSITIONS[order.status] ?? []
    if (!allowed.includes(newStatus)) {
      return NextResponse.json({ error: `Cannot transition from ${order.status} to ${newStatus}` }, { status: 400 })
    }

    // Cancelling a PO requires a reason (audit trail: supplier out of stock, better price, etc.)
    if (newStatus === 'CANCELLED' && !reason?.trim()) {
      return NextResponse.json({ error: 'A cancellation reason is required' }, { status: 400 })
    }

    const updates = { status: newStatus }
    if (newStatus === 'CANCELLED') {
      updates.cancelled_at = new Date().toISOString()
      updates.cancellation_reason = reason.trim()
    }

    await supabase.from('orders').update(updates).eq('id', id)

    if (reason) {
      try {
        await supabase.from('order_status_log').insert({
          order_id:  id,
          from_status: order.status,
          to_status:   newStatus,
          reason,
        })
      } catch { /* status-log is best-effort */ }
    }

    return NextResponse.json({ success: true, status: newStatus })

  } catch (error) {
    console.error('[purchases/[id] PATCH]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
