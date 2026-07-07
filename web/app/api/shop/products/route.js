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

    // The public catalog is platform-curated: only SUPER_ADMIN-featured shops appear here.
    const { data: storesData } = await supabase
      .from('entities')
      .select('id, name, whatsapp_no, tpn_gstin, delivery_mode')
      .eq('role', 'RETAILER')
      .eq('is_active', true)
      .eq('is_featured', true)
      .order('name')

    const featuredIds = (storesData || []).map(s => s.id)

    // Load products belonging only to those featured shops.
    const { data: productsData } = featuredIds.length
      ? await supabase
          .from('products')
          .select('*')
          .eq('is_active', true)
          .gt('current_stock', 0)
          .in('created_by', featuredIds)
          .order('name')
          .limit(50)
      : { data: [] }

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
