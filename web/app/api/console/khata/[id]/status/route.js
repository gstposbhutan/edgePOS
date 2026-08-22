import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// Freeze / unfreeze (ACTIVE) / close one of the caller's khata accounts (creditor = me).
const VENDOR_ROLES = ['DISTRIBUTOR', 'WHOLESALER']
const STATUSES = ['ACTIVE', 'FROZEN', 'CLOSED']

export async function POST(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    if (!VENDOR_ROLES.includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const { entityId, supabase } = ctx
    const { status } = await request.json().catch(() => ({}))
    if (!STATUSES.includes(status)) return NextResponse.json({ error: 'status must be ACTIVE, FROZEN or CLOSED' }, { status: 400 })

    const { data: account } = await supabase
      .from('khata_accounts').select('id').eq('id', id).eq('creditor_entity_id', entityId).maybeSingle()
    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

    const { error } = await supabase
      .from('khata_accounts').update({ status, updated_at: new Date().toISOString() })
      .eq('id', id).eq('creditor_entity_id', entityId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, status })
  } catch (err) {
    console.error('[console/khata/[id]/status] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
