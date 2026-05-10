import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request, { params }) {
  try {
    const { slug } = await params
    const supabase = createServiceClient()

    // Fetch entity by slug
    const { data: entity, error: entityError } = await supabase
      .from('entities')
      .select('id, name, whatsapp_no, marketplace_bio, marketplace_logo_url, shop_slug')
      .eq('shop_slug', slug)
      .eq('is_active', true)
      .single()

    if (entityError || !entity) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 })
    }

    // Fetch visible products with their categories
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select(`
        id, name, mrp, unit, image_url,
        product_categories (
          categories (id, name)
        )
      `)
      .eq('entity_id', entity.id)
      .eq('is_active', true)
      .eq('visible_on_web', true)
      .gt('current_stock', 0)
      .order('name')

    if (productsError) {
      return NextResponse.json({ error: 'Failed to load products' }, { status: 500 })
    }

    // Group products by category
    const categoryMap = new Map()
    for (const product of (products ?? [])) {
      const cats = product.product_categories ?? []
      const catName = cats.length > 0 ? cats[0].categories?.name : 'Other'
      if (!categoryMap.has(catName)) categoryMap.set(catName, [])
      categoryMap.get(catName).push({
        id: product.id,
        name: product.name,
        mrp: parseFloat(product.mrp),
        unit: product.unit,
        image_url: product.image_url,
      })
    }

    // Sort categories alphabetically, "Other" last
    const categories = [...categoryMap.entries()]
      .sort(([a], [b]) => {
        if (a === 'Other') return 1
        if (b === 'Other') return -1
        return a.localeCompare(b)
      })
      .map(([name, products]) => ({ name, products }))

    return NextResponse.json({
      store: {
        name: entity.name,
        slug: entity.shop_slug,
        bio: entity.marketplace_bio,
        logo_url: entity.marketplace_logo_url,
        whatsapp_no: entity.whatsapp_no,
      },
      categories,
    })
  } catch (err) {
    console.error('Marketplace API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
