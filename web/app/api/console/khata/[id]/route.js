import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// Account detail + ledger for one of the caller's khata accounts (they must be the creditor).
const VENDOR_ROLES = ['DISTRIBUTOR', 'WHOLESALER']

export async function GET(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    if (!VENDOR_ROLES.includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const { entityId, supabase } = ctx

    const { data: account } = await supabase
      .from('khata_accounts').select('*')
      .eq('id', id).eq('creditor_entity_id', entityId).maybeSingle()
    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

    const [{ data: transactions }, { data: repayments }] = await Promise.all([
      supabase.from('khata_transactions').select('*').eq('khata_account_id', id).order('created_at', { ascending: false }).limit(100),
      supabase.from('khata_repayments').select('*').eq('khata_account_id', id).order('created_at', { ascending: false }).limit(50),
    ])
    return NextResponse.json({ account, transactions: transactions ?? [], repayments: repayments ?? [] })
  } catch (err) {
    console.error('[console/khata/[id]] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
