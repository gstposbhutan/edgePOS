import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// Vendor consoles (distributor / wholesaler) manage their OWN products — the items they
// supply. A vendor's catalog is `products WHERE created_by = <their entity>`, the same
// provenance model the wholesale sellable-list uses. This route is entity-scoped and gated
// to OWNER/MANAGER; it is separate from the retailer /api/products/catalog on purpose so the
// two flows can diverge (vendors edit B2B prices here; retailers manage prices via receipts).

/** GET /api/console/catalog — this vendor's own products + the category list */
export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { entityId, supabase } = ctx

    const [productsResult, categoriesResult] = await Promise.all([
      supabase
        .from('products')
        .select(`
          id, name, sku, hsn_code, unit, wholesale_price, mrp, distributor_price,
          current_stock, is_active, sold_by_weight, product_type, created_at,
          product_categories(category_id, categories(id, name))
        `)
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
    console.error('[console/catalog] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** POST /api/console/catalog — create one of this vendor's products (with B2B prices + opening stock) */
export async function POST(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { entityId, supabase } = ctx
    const body = await request.json()
    const { formData, categoryIds } = body

    if (!formData?.name?.trim()) return NextResponse.json({ error: 'Product name is required' }, { status: 400 })
    if (!formData?.hsn_code?.trim()) return NextResponse.json({ error: 'HSN code is required' }, { status: 400 })

    const { data: product, error } = await supabase
      .from('products')
      .insert({
        name:             formData.name.trim(),
        sku:              formData.sku?.trim() || null,
        hsn_code:         formData.hsn_code.trim(),
        unit:             formData.unit || 'pcs',
        wholesale_price:  numOrNull(formData.wholesale_price),
        mrp:              numOrNull(formData.mrp),
        distributor_price: numOrNull(formData.distributor_price),
        current_stock:    parseInt(formData.current_stock) || 0,
        reorder_point:    parseInt(formData.reorder_point) || 10,
        sold_by_weight:   !!formData.sold_by_weight,
        is_active:        true,
        created_by:       entityId,
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

    // Opening stock — record a batch + RESTOCK movement so inventory reconciles
    // (same flow the retailer catalog uses on create).
    const openingStock = parseInt(formData.current_stock) || 0
    if (openingStock > 0) {
      const batchNo = formData.batch_number?.trim() || `OPEN-${Date.now()}`
      const { data: batch } = await supabase
        .from('product_batches')
        .insert({
          product_id:      product.id,
          entity_id:       entityId,
          batch_number:    batchNo,
          manufactured_at: formData.manufactured_at || null,
          expires_at:      formData.expires_at || null,
          quantity:        openingStock,
          status:          'ACTIVE',
          notes:           'Opening stock',
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
    console.error('[console/catalog] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Coerce a price field to a number, treating blank/invalid as null (price not set).
function numOrNull(v) {
  if (v === '' || v === null || v === undefined) return null
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}
