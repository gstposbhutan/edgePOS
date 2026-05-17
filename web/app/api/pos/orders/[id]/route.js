import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/** GET /api/pos/orders/[id] — fetch order detail */
export async function GET(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { entityId, supabase } = ctx
    const { id } = await params

    const { data: order } = await supabase
      .from('orders')
      .select('*, sales_order:orders!sales_order_id(id, order_no)')
      .eq('id', id)
      .single()

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    const { data: items } = await supabase
      .from('order_items')
      .select('*, batch:batch_id(id, batch_number, expires_at, mrp, selling_price)')
      .eq('order_id', id)
      .order('created_at')

    const { data: timeline } = await supabase
      .from('order_status_log')
      .select('*')
      .eq('order_id', id)
      .order('created_at')

    const { data: refunds } = await supabase
      .from('refunds')
      .select('*')
      .eq('order_id', id)
      .order('created_at')

    const { data: replacements } = await supabase
      .from('replacements')
      .select('*')
      .eq('order_id', id)
      .order('created_at')

    // For CREDIT orders, fetch the customer's khata account and entity name
    let khataAccount = null
    let customerName = null
    const phone = order?.buyer_whatsapp ?? order?.buyer_phone
    if (order?.payment_method === 'CREDIT' && phone) {
      const [acctResult, customerResult] = await Promise.all([
        supabase
          .from('khata_accounts')
          .select('id, debtor_name, debtor_phone, outstanding_balance, credit_limit, party_type')
          .eq('creditor_entity_id', entityId)
          .eq('debtor_phone', phone)
          .single(),
        supabase
          .from('entities')
          .select('name')
          .eq('whatsapp_no', phone)
          .single(),
      ])
      khataAccount = acctResult.data ?? null
      customerName = acctResult.data?.debtor_name || customerResult.data?.name || null
    }

    return NextResponse.json({
      order,
      items: items ?? [],
      timeline: timeline ?? [],
      refunds: refunds ?? [],
      replacements: replacements ?? [],
      khataAccount,
      customerName,
    })
  } catch (err) {
    console.error('[pos/orders/[id]] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
