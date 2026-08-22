import { NextResponse } from 'next/server'
import { getRiderContext } from '@/lib/supabase/server'

// POST /api/rider/location — the rider PWA reports its GPS position so dispatch can weight new
// assignments by proximity to the pickup. Best-effort; coordinates are validated loosely.
export async function POST(request) {
  try {
    const ctx = await getRiderContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { lat, lng } = await request.json()
    const la = Number(lat), lo = Number(lng)
    if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) {
      return NextResponse.json({ error: 'Valid lat/lng required' }, { status: 400 })
    }

    const { supabase, userId } = ctx
    const { error } = await supabase
      .from('riders')
      .update({ last_lat: la, last_lng: lo, location_updated_at: new Date().toISOString() })
      .eq('auth_user_id', userId)

    if (error) throw error
    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[rider/location]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
