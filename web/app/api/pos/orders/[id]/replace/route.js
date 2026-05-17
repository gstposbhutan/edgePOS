import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/** POST /api/pos/orders/[id]/replace — request a replacement */
export async function POST(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { userId, supabase } = ctx
    const { id } = await params
    const { orderItemId, reason } = await request.json()

    const { error } = await supabase.from('replacements').insert({
      original_order_id: id,
      order_item_id: orderItemId,
      reason,
      requested_by: userId,
      status: 'REQUESTED',
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await supabase.from('orders').update({ status: 'REPLACEMENT_REQUESTED' }).eq('id', id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[pos/orders/[id]/replace] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
