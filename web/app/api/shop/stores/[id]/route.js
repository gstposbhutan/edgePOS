import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/shop/stores/[id] — public store detail with products
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params
    const supabase = createServiceClient()
    if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

    const { data: storeData } = await supabase
      .from('entities')
      .select('*')
      .eq('id', id)
      .eq('is_active', true)
      .single()

    if (!storeData) {
      return NextResponse.json({ store: null, products: [] })
    }

    const { data: productsData } = await supabase
      .from('products')
      .select('*')
      .eq('created_by', id)
      .eq('is_active', true)
      .gt('current_stock', 0)
      .order('name')

    return NextResponse.json({
      store: storeData,
      products: productsData || [],
    })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
