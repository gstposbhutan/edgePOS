import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'

// GET /api/license/status?lic_id=… — public revocation check for the desktop.
// Offline, the terminal verifies signature + expiry locally; when ONLINE it calls this
// to confirm the license hasn't been revoked server-side. Reveals only active/expired/revoked.
export async function GET(request) {
  const licId = new URL(request.url).searchParams.get('lic_id')
  if (!licId) return NextResponse.json({ error: 'lic_id required' }, { status: 400 })

  const supabase = getServiceClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data } = await supabase
    .from('licenses').select('is_active, expires_at').eq('lic_id', licId).maybeSingle()
  if (!data) return NextResponse.json({ active: false, reason: 'unknown' })

  const expired = new Date(data.expires_at) < new Date()
  return NextResponse.json({ active: !!data.is_active && !expired, revoked: !data.is_active, expired })
}
