import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// Read-only NQRC merchant config for the caller's own entity. Any authenticated POS user (incl.
// cashiers) needs this to render the payment QR at checkout — editing the bank details is gated
// elsewhere (OWNER via /api/admin/settings, SUPER_ADMIN via /api/admin/entities/[id]).
export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { entityId, supabase } = ctx
  const { data, error } = await supabase
    .from('entities')
    .select('name, nqrc_enabled, nqrc_merchant_name, nqrc_merchant_city, nqrc_account_id, nqrc_psp_guid, nqrc_mcc, nqrc_account_tag')
    .eq('id', entityId)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    nqrc: {
      enabled: !!data.nqrc_enabled,
      merchantName: data.nqrc_merchant_name || data.name,
      merchantCity: data.nqrc_merchant_city || '',
      accountId: data.nqrc_account_id || '',
      pspGuid: data.nqrc_psp_guid || '',
      mcc: data.nqrc_mcc || '',
      accountTag: data.nqrc_account_tag || '26',
    },
  })
}
