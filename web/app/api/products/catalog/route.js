import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'
import { nextUniqueSku } from '@/lib/products/sku'

/** GET /api/products/catalog — fetch products with categories and categories list */
export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { supabase, entityId } = ctx

    // A product's taxonomy is its HSN `category`/`subcategory` (category consolidation) — the
    // `product_categories`/`categories` tag tables are retired, so we no longer embed or list them.
    const productsResult = await supabase
      .from('products')
      .select(`
        id, name, sku, hsn_code, unit, mrp, wholesale_price, selling_price,
        current_stock, image_url, is_active, sold_by_weight, gst_exempt, created_at,
        category, subcategory, condition, brand, description, tags, specifications, video_url, ai_enriched, stock_rotation
      `)
      // Scope to the caller's own shop — a store only manages its own catalog (multi-tenant).
      .eq('created_by', entityId)
      .order('name')

    if (productsResult.error) return NextResponse.json({ error: productsResult.error.message }, { status: 500 })

    return NextResponse.json({
      products: productsResult.data ?? [],
      categories: [],   // tag categories retired; kept for response-shape stability
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
    const { formData } = body

    // FEFO needs an expiry on every batch — block a FEFO create whose opening batch has none
    // (create isn't transactional, so the DB trigger would orphan the product otherwise).
    if (formData.stock_rotation === 'FEFO' && (parseInt(formData.current_stock) || 0) > 0 && !formData.expires_at) {
      return NextResponse.json({ error: 'FEFO products need an expiry date on the opening batch.' }, { status: 400 })
    }

    // Blank SKU → auto-number: continue this vendor's series, else start a default one.
    const sku = formData.sku?.trim() || await nextUniqueSku(supabase, entityId)

    const { data: product, error } = await supabase
      .from('products')
      .insert({
        name:            formData.name.trim(),
        sku,
        hsn_code:        formData.hsn_code.trim(),
        brand:           formData.brand?.trim() || null,
        stock_rotation:  ['FEFO','FIFO','NONE'].includes(formData.stock_rotation) ? formData.stock_rotation : 'FIFO',
        unit:            formData.unit || 'pcs',
        selling_price:   formData.selling_price != null && formData.selling_price !== '' ? parseFloat(formData.selling_price) : null,
        mrp:             formData.mrp != null && formData.mrp !== '' ? parseFloat(formData.mrp) : null,
        wholesale_price: formData.wholesale_price != null && formData.wholesale_price !== '' ? parseFloat(formData.wholesale_price) : null,
        current_stock:   0,   // opening stock is applied by the RESTOCK movement below (its trigger increments current_stock) — setting it here too double-counts
        image_url:       formData.image_url?.trim() || null,
        reorder_point:   parseInt(formData.reorder_point) || 10,
        sold_by_weight:  !!formData.sold_by_weight,
        gst_exempt:      !!formData.gst_exempt,
        video_url:       formData.video_url?.trim() || null,
        ...(formData.specifications !== undefined ? { specifications: formData.specifications || {} } : {}),
        is_active:       true,
        created_by:      entityId,
      })
      .select('id')
      .single()

    if (error) {
      if (error.code === '23505' && /sku/i.test(error.message || '')) {
        return NextResponse.json({ error: `SKU "${sku}" is already in use. Leave SKU blank to auto-number.` }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Category TAGS retired (category consolidation Phase 2) — a product's taxonomy is its
    // HSN category/subcategory; product_categories tags are no longer authored.

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
          quantity:       0,   // set by the RESTOCK movement below (its sync trigger adds openingStock) — setting it here too doubles the batch
          unit_cost:      formData.cost_price != null && formData.cost_price !== '' ? parseFloat(formData.cost_price) : null,
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
