import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/shop/products — public storefront listing
 * No auth required — this is the consumer-facing product catalog
 */
export async function GET() {
  try {
    const supabase = createServiceClient()
    if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

    // Load products from all active retailers
    const { data: productsData } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .gt('current_stock', 0)
      .order('name')
      .limit(50)

    // Load active stores/retailers
    const { data: storesData } = await supabase
      .from('entities')
      .select('id, name, whatsapp_no, tpn_gstin')
      .eq('role', 'RETAILER')
      .eq('is_active', true)
      .order('name')

    // Create a map of entities for quick lookup by created_by
    const entityMap = {}
    if (storesData) {
      storesData.forEach(store => {
        entityMap[store.id] = store
      })
    }

    // Attach entity info to each product using created_by field
    const productsWithEntities = (productsData || []).map(product => ({
      ...product,
      entities: entityMap[product.created_by] || null,
    }))

    return NextResponse.json({
      products: productsWithEntities,
      stores: storesData || [],
    })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
