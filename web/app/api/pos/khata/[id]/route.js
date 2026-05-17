import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/** GET /api/pos/khata/[id] — fetch account with transaction ledger */
export async function GET(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const { supabase } = ctx

    const { data: account } = await supabase
      .from('khata_accounts')
      .select('*')
      .eq('id', id)
      .single()

    const { data: transactions } = await supabase
      .from('khata_transactions')
      .select('*')
      .eq('khata_account_id', id)
      .order('created_at', { ascending: true })

    return NextResponse.json({ account, transactions: transactions ?? [] })
  } catch (err) {
    console.error('[khata/[id]] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
