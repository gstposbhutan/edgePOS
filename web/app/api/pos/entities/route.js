import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

export async function GET(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const phone          = searchParams.get('phone')
  const entityId       = searchParams.get('entityId')
  const supplierSearch = searchParams.get('supplierSearch')

  const supabase = ctx.supabase

  if (phone) {
    // Customer lookup by phone
    const { data, error } = await supabase
      .from('entities')
      .select('id, name, whatsapp_no')
      .eq('whatsapp_no', phone)
      .single()

    if (error) return NextResponse.json({ entity: null })
    return NextResponse.json({ entity: data })
  }

  // Supplier search (wholesalers)
  if (supplierSearch) {
    const { data, error } = await supabase
      .from('entities')
      .select('id, name, whatsapp_no')
      .eq('role', 'WHOLESALER')
      .ilike('name', `%${supplierSearch}%`)
      .limit(8)

    return NextResponse.json({ suppliers: data || [] })
  }

  // Get entity by explicit ID
  if (entityId) {
    const { data, error } = await supabase
      .from('entities')
      .select('id, name, tpn_gstin')
      .eq('id', entityId)
      .single()

    if (error) return NextResponse.json({ entity: null })
    return NextResponse.json({ entity: data })
  }

  // Get current entity info
  const { data, error } = await supabase
    .from('entities')
    .select('id, name, tpn_gstin')
    .eq('id', ctx.entityId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entity: data })
}
