import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

export async function GET(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const tab = searchParams.get('tab') || 'SO'

  const supabase = ctx.supabase

  let query = supabase
    .from('orders')
    .select('id, order_no, order_type, order_source, status, grand_total, gst_total, buyer_whatsapp, payment_method, created_at, sales_order_id, sales_orders:orders!sales_order_id(order_no)')
    .eq('seller_id', ctx.entityId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (tab === 'SO')  query = query.eq('order_type', 'SALES_ORDER')
  else if (tab === 'SI')  query = query.eq('order_type', 'SALES_INVOICE')
  else if (tab === 'MKT') query = query.eq('order_type', 'MARKETPLACE')
  else if (tab === 'WA')  query = query.eq('order_source', 'WHATSAPP')

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ orders: data || [] })
}
