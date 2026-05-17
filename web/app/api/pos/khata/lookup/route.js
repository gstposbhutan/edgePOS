import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/** GET /api/pos/khata/lookup?phone=... — look up account by phone */
export async function GET(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { entityId, supabase } = ctx
    const { searchParams } = new URL(request.url)
    const phone = searchParams.get('phone')

    if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 })

    const { data, error } = await supabase
      .from('khata_accounts')
      .select('*')
      .eq('creditor_entity_id', entityId)
      .eq('debtor_phone', phone)
      .eq('party_type', 'CONSUMER')
      .in('status', ['ACTIVE', 'FROZEN'])
      .limit(1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const account = data?.[0] ?? null
    return NextResponse.json({ account })
  } catch (err) {
    console.error('[khata/lookup] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
