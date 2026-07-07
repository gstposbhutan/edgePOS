import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/** GET /api/products/catalog — fetch products with categories and categories list */
export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { supabase, entityId } = ctx

    const [productsResult, categoriesResult] = await Promise.all([
      supabase
        .from('products')
        .select(`
          id, name, sku, hsn_code, unit, mrp, wholesale_price, selling_price,
          current_stock, image_url, is_active, sold_by_weight, created_at,
          category, subcategory, condition, brand, description, tags, specifications, video_url, ai_enriched,
          product_categories(category_id, categories(id, name))
        `)
        // Scope to the caller's own shop — a store only manages its own catalog (multi-tenant).
        .eq('created_by', entityId)
        .order('name'),
      supabase
        .from('categories')
        .select('id, name')
        .order('name'),
    ])

    if (productsResult.error) return NextResponse.json({ error: productsResult.error.message }, { status: 500 })

    return NextResponse.json({
      products: productsResult.data ?? [],
      categories: categoriesResult.data ?? [],
    })
  } catch (err) {
    console.error('[products/catalog] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** POST /api/products/catalog — create a new product */
export async function POST(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { entityId, supabase } = ctx
    const body = await request.json()
    const { formData, categoryIds } = body

    const { data: product, error } = await supabase
      .from('products')
      .insert({
        name:            formData.name.trim(),
        sku:             formData.sku?.trim() || null,
        hsn_code:        formData.hsn_code.trim(),
        unit:            formData.unit || 'pcs',
        current_stock:   parseInt(formData.current_stock) || 0,
        image_url:       formData.image_url?.trim() || null,
        reorder_point:   parseInt(formData.reorder_point) || 10,
        sold_by_weight:  !!formData.sold_by_weight,
        video_url:       formData.video_url?.trim() || null,
        ...(formData.specifications !== undefined ? { specifications: formData.specifications || {} } : {}),
        is_active:       true,
        created_by:      entityId,
      })
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Assign categories
    if (categoryIds?.length > 0) {
      await supabase.from('product_categories').insert(
        categoryIds.map(cid => ({ product_id: product.id, category_id: cid }))
      )
    }

    // If initial stock > 0, create opening batch + RESTOCK movement
    const openingStock = parseInt(formData.current_stock) || 0
    if (openingStock > 0) {
      const batchNo = formData.batch_number?.trim() || `OPEN-${Date.now()}`
      const { data: batch } = await supabase
        .from('product_batches')
        .insert({
          product_id:     product.id,
          entity_id:      entityId,
          batch_number:   batchNo,
          manufactured_at: formData.manufactured_at || null,
          expires_at:     formData.expires_at || null,
          quantity:       openingStock,
          status:         'ACTIVE',
          notes:          'Opening stock',
        })
        .select('id')
        .single()

      await supabase.from('inventory_movements').insert({
        product_id:    product.id,
        entity_id:     entityId,
        movement_type: 'RESTOCK',
        quantity:      openingStock,
        batch_id:      batch?.id ?? null,
        notes:         `Opening stock — Batch ${batchNo}`,
      })
    }

    return NextResponse.json({ product }, { status: 201 })
  } catch (err) {
    console.error('[products/catalog] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
