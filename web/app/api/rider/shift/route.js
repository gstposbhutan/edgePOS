import { NextResponse } from 'next/server'
import { getRiderContext } from '@/lib/supabase/server'
import { drainBacklog } from '@/lib/riders/dispatch'

// POST /api/rider/shift — rider goes on/off shift. is_available now means "accepting new orders".
// Going ON shift drains any orders that were orphaned while no rider was available.
export async function POST(request) {
  try {
    const ctx = await getRiderContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { available } = await request.json()
    const on = !!available

    const { supabase, userId } = ctx
    const { data: rider, error } = await supabase
      .from('riders')
      .update({ is_available: on })
      .eq('auth_user_id', userId)
      .select('id, is_available')
      .single()

    if (error || !rider) return NextResponse.json({ error: 'Rider not found' }, { status: 404 })

    let drained = 0
    if (on) drained = await drainBacklog(supabase)

    return NextResponse.json({ success: true, is_available: rider.is_available, drained })

  } catch (error) {
    console.error('[rider/shift]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
