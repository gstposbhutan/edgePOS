import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'
import { nextUniqueSku } from '@/lib/products/sku'

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

    // A product's taxonomy is its HSN `category`/`subcategory` (category consolidation) — the
    // `product_categories`/`categories` tag tables are retired, so we no longer embed or list them.
    const productsResult = await supabase
      .from('products')
      .select(`
        id, name, sku, hsn_code, brand, unit, wholesale_price, mrp, distributor_price, manufacturer_price,
        gst_exempt, current_stock, is_active, sold_by_weight, product_type, created_at, stock_rotation,
        category, subcategory
      `)
      .eq('created_by', entityId)
      .order('name')

    if (productsResult.error) return NextResponse.json({ error: productsResult.error.message }, { status: 500 })

    return NextResponse.json({
      products: productsResult.data ?? [],
      categories: [],   // tag categories retired; kept for response-shape stability
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
    const { formData } = body

    if (!formData?.name?.trim()) return NextResponse.json({ error: 'Product name is required' }, { status: 400 })
    if (!formData?.hsn_code?.trim()) return NextResponse.json({ error: 'HSN code is required' }, { status: 400 })

    // FEFO needs an expiry on every batch — block a FEFO create whose opening batch has none
    // (create isn't transactional, so the DB trigger would orphan the product otherwise).
    const rotation = ['FEFO','FIFO','NONE'].includes(formData.stock_rotation) ? formData.stock_rotation : 'FIFO'
    if (rotation === 'FEFO' && (parseInt(formData.current_stock) || 0) > 0 && !formData.expires_at) {
      return NextResponse.json({ error: 'FEFO products need an expiry date on the opening batch.' }, { status: 400 })
    }

    // Blank SKU → auto-number: continue this vendor's series, else start a default one.
    const sku = formData.sku?.trim() || await nextUniqueSku(supabase, entityId)

    const { data: product, error } = await supabase
      .from('products')
      .insert({
        name:             formData.name.trim(),
        sku,
        hsn_code:         formData.hsn_code.trim(),
        brand:            formData.brand?.trim() || null,
        stock_rotation:   rotation,
        unit:             formData.unit || 'pcs',
        wholesale_price:  numOrNull(formData.wholesale_price),
        mrp:              numOrNull(formData.mrp),
        distributor_price: numOrNull(formData.distributor_price),
        manufacturer_price: numOrNull(formData.manufacturer_price),
        gst_exempt:       !!formData.gst_exempt,
        current_stock:    0,   // opening stock is set by the RESTOCK movement below (avoids a double-count)
        reorder_point:    parseInt(formData.reorder_point) || 10,
        sold_by_weight:   !!formData.sold_by_weight,
        is_active:        true,
        created_by:       entityId,
      })
      .select('id')
      .single()

    if (error) {
      if (error.code === '23505' && /sku/i.test(error.message || '')) {
        return NextResponse.json({ error: `SKU "${sku}" is already in use. Leave SKU blank to auto-number.` }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Category TAGS retired (Phase 2) — no longer authored.

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
          quantity:        0,   // set by the RESTOCK movement below (avoids doubling the batch)
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
