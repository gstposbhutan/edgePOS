import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const wholesalerId = searchParams.get('wholesaler_id')
    const search = searchParams.get('search') || ''

    if (!wholesalerId) {
      return NextResponse.json({ error: 'wholesaler_id required' }, { status: 400 })
    }

    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const retailerId = ctx.entityId
    const supabase = ctx.supabase

    // Verify retailer-wholesaler connection
    const { data: connection } = await supabase
      .from('retailer_wholesalers')
      .select('wholesaler_id')
      .eq('retailer_id', retailerId)
      .eq('wholesaler_id', wholesalerId)
      .eq('active', true)
      .limit(1)

    if (!connection || connection.length === 0) {
      return NextResponse.json({ error: 'Not connected to this wholesaler' }, { status: 403 })
    }

    // Fetch wholesaler's products
    let query = supabase
      .from('products')
      .select('id, name, sku, wholesale_price, mrp, unit, current_stock, hsn_code')
      .eq('created_by', wholesalerId)
      .eq('is_active', true)
      .gt('wholesale_price', 0)
      .order('name')

    if (search) {
      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`)
    }

    const { data: products, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ products })
  } catch (err) {
    console.error('Wholesale catalog error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
