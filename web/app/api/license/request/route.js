import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'

// Public (unauthenticated) terminal endpoints. A new RETAILER POS terminal calls these
// on first start (before it has a .lic) so the super-admin can issue with the machine_id
// pre-filled. Reveals only status — no secrets.

// POST /api/license/request — self-register this machine as a PENDING license request.
export async function POST(request) {
  const supabase = getServiceClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const body = await request.json().catch(() => ({}))
  const machineId = (body.machine_id || '').trim()
  if (!machineId) return NextResponse.json({ error: 'machine_id required' }, { status: 400 })

  // Already licensed? Tell the terminal so it stops requesting.
  const { data: lic } = await supabase
    .from('licenses').select('is_active').eq('machine_id', machineId).eq('is_active', true).maybeSingle()
  if (lic) return NextResponse.json({ status: 'LICENSED' })

  const { error } = await supabase.from('license_requests').upsert({
    machine_id: machineId,
    hostname: (body.hostname || '').trim() || null,
    app_version: (body.app_version || '').trim() || null,
    status: 'PENDING',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'machine_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ status: 'PENDING' })
}

// GET /api/license/request?machine_id= — the terminal polls for its status.
export async function GET(request) {
  const supabase = getServiceClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const machineId = new URL(request.url).searchParams.get('machine_id')
  if (!machineId) return NextResponse.json({ error: 'machine_id required' }, { status: 400 })

  const { data: lic } = await supabase
    .from('licenses').select('is_active').eq('machine_id', machineId).eq('is_active', true).maybeSingle()
  if (lic) return NextResponse.json({ status: 'LICENSED' })

  const { data: req } = await supabase
    .from('license_requests').select('status').eq('machine_id', machineId).maybeSingle()
  return NextResponse.json({ status: req?.status || 'NONE' })
}
