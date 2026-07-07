import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

export async function GET(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const q            = searchParams.get('q') ?? ''
  const barcode      = searchParams.get('barcode') ?? ''
  const productId    = searchParams.get('productId') ?? ''
  const batchId      = searchParams.get('batchId') ?? ''
  const packageId    = searchParams.get('packageId') ?? ''
  const entityId     = ctx.entityId

  const supabase = ctx.supabase

  const selectFields = 'id, batch_number, expires_at, mrp, selling_price, quantity, products!inner(id, name, sku, unit, mrp, selling_price, wholesale_price, distributor_price, sold_by_weight)'

  // Price-ladder lookup for a set of product ids (used by the POS price-list
  // re-pricer). Returns the product's mrp / wholesale / distributor so the cart
  // can re-price existing lines when the active price list changes.
  const ids = searchParams.get('ids') ?? ''
  if (ids) {
    const idList = ids.split(',').map(s => s.trim()).filter(Boolean)
    const { data, error } = await supabase
      .from('products')
      .select('id, mrp, selling_price, wholesale_price, distributor_price')
      .in('id', idList)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ products: data ?? [] })
  }

  // Stock check: single product by ID
  if (productId) {
    const { data, error } = await supabase
      .from('products')
      .select('id, current_stock')
      .eq('id', productId)
      .single()
    if (error) return NextResponse.json({ product: null })
    return NextResponse.json({ product: data })
  }

  // Stock check: single batch by ID
  if (batchId) {
    const { data, error } = await supabase
      .from('product_batches')
      .select('id, quantity, batch_number')
      .eq('id', batchId)
      .single()
    if (error) return NextResponse.json({ batch: null })
    return NextResponse.json({ batch: data })
  }

  // Stock check: package available qty
  if (packageId) {
    const { data, error } = await supabase
      .rpc('package_available_qty', { p_package_id: packageId })
    if (error) return NextResponse.json({ available: 0 })
    return NextResponse.json({ available: data ?? 0 })
  }

  // Barcode exact lookup
  if (barcode) {
    const { data: byBarcode } = await supabase
      .from('product_batches')
      .select(selectFields)
      .eq('entity_id', entityId)
      .eq('barcode', barcode)
      .eq('status', 'ACTIVE')
      .gt('quantity', 0)
      .limit(1)

    if (byBarcode?.[0]) {
      return NextResponse.json({ results: byBarcode })
    }

    // Fallback: match by product SKU
    const { data: bySku } = await supabase
      .from('product_batches')
      .select(selectFields)
      .eq('entity_id', entityId)
      .eq('status', 'ACTIVE')
      .gt('quantity', 0)
      .or(`sku.eq.${barcode}`, { referencedTable: 'products' })
      .order('expires_at', { ascending: true, nullsFirst: false })
      .limit(1)

    return NextResponse.json({ results: bySku ?? [] })
  }

  // Text search
  if (!q.trim()) return NextResponse.json({ results: [] })

  const { data, error } = await supabase
    .from('product_batches')
    .select(selectFields)
    .eq('entity_id', entityId)
    .eq('status', 'ACTIVE')
    .gt('quantity', 0)
    .or(`name.ilike.%${q}%,sku.ilike.%${q}%`, { referencedTable: 'products' })
    .order('expires_at', { ascending: true, nullsFirst: false })
    .limit(9)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ results: data ?? [] })
}

/** POST /api/pos/products — batch lookup for multiple productIds */
export async function POST(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { productIds } = await request.json()
  if (!productIds?.length) return NextResponse.json({ batches: [] })

  const supabase = ctx.supabase

  const { data, error } = await supabase
    .from('product_batches')
    .select('id, product_id, batch_number, expires_at, quantity, selling_price, mrp')
    .in('product_id', productIds)
    .eq('entity_id', ctx.entityId)
    .eq('status', 'ACTIVE')
    .gt('quantity', 0)
    .order('expires_at', { ascending: true, nullsFirst: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ batches: data || [] })
}
