import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/** POST /api/pos/orders/[id]/cancel — cancel an order */
export async function POST(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { userId, role, supabase } = ctx
    const { id } = await params
    const { reason, actor_id, actor_role } = await request.json()

    const { error } = await supabase
      .from('orders')
      .update({
        status: 'CANCELLED',
        cancellation_reason: reason,
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Log the cancellation actor
    await supabase.from('order_status_log').insert({
      order_id: id,
      from_status: 'CANCELLATION_REQUESTED',
      to_status: 'CANCELLED',
      actor_id: actor_id || userId,
      actor_role: actor_role || role,
      reason,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[pos/orders/[id]/cancel] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
