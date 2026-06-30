import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// A linked distributor's sellable catalog, for a wholesaler to browse before ordering. Mirrors
// /api/wholesale/catalog (the retailer→wholesaler version): verify the link first, then return the
// distributor's active products that carry a B2B price. The sellable rate here is distributor_price
// (what the distributor charges wholesalers); current_stock is the distributor's stock.
//
// Model B (P4): in addition to SINGLE products, this also returns the distributor's discrete
// PACKAGE levels (stocked_as_unit = true) — a pallet or a box is just a PACKAGE product carrying its
// own sealed current_stock, so the wholesaler can order a whole pallet. For packages availability is
// the package product's own current_stock (not the floored package_available_qty), and the price
// falls back distributor_price → wholesale_price → mrp (distributor-only pallets often price only on
// wholesale_price). Each package line carries package_id (the product_packages row) so the order can
// be written/provisioned at the right level.

// Best B2B unit price for a level: distributor rate first, then wholesale, then mrp.
function b2bPrice(p) {
  const candidates = [p.distributor_price, p.wholesale_price, p.mrp]
  for (const c of candidates) {
    const n = parseFloat(c)
    if (Number.isFinite(n) && n > 0) return n
  }
  return 0
}

/** GET /api/console/suppliers/[id]/catalog — products this distributor sells to me. */
export async function GET(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }
    if (ctx.role !== 'WHOLESALER') {
      return NextResponse.json({ error: 'Only wholesalers can browse distributor catalogs' }, { status: 403 })
    }

    const { id: distributorId } = await params
    const { entityId, supabase } = ctx
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''

    if (!distributorId) {
      return NextResponse.json({ error: 'distributor id required' }, { status: 400 })
    }

    // Verify the link before exposing the catalog (403 if not linked).
    const { data: link } = await supabase
      .from('distributor_wholesalers')
      .select('distributor_id')
      .eq('distributor_id', distributorId)
      .eq('wholesaler_id', entityId)
      .eq('active', true)
      .limit(1)

    if (!link?.length) {
      return NextResponse.json({ error: 'Not linked to this distributor' }, { status: 403 })
    }

    // SINGLE products that carry a distributor rate — unchanged behaviour.
    let singleQuery = supabase
      .from('products')
      .select('id, name, sku, distributor_price, wholesale_price, mrp, unit, current_stock, hsn_code, product_type')
      .eq('created_by', distributorId)
      .eq('is_active', true)
      .eq('product_type', 'SINGLE')
      .gt('distributor_price', 0)
      .order('name')

    if (search) {
      singleQuery = singleQuery.or(`name.ilike.%${search}%,sku.ilike.%${search}%`)
    }

    // PACKAGE levels (Model B): the package product joined to its definition so we can return the
    // package_id and price the level. Availability is the package product's own current_stock.
    let pkgQuery = supabase
      .from('products')
      .select('id, name, sku, distributor_price, wholesale_price, mrp, unit, current_stock, hsn_code, product_type, product_packages!inner(id, package_type, stocked_as_unit, is_active)')
      .eq('created_by', distributorId)
      .eq('is_active', true)
      .eq('product_type', 'PACKAGE')
      .eq('product_packages.stocked_as_unit', true)
      .eq('product_packages.is_active', true)
      .order('name')

    if (search) {
      pkgQuery = pkgQuery.or(`name.ilike.%${search}%,sku.ilike.%${search}%`)
    }

    const [{ data: singles, error: singleErr }, { data: pkgs, error: pkgErr }] = await Promise.all([
      singleQuery,
      pkgQuery,
    ])
    if (singleErr) return NextResponse.json({ error: singleErr.message }, { status: 500 })
    if (pkgErr) return NextResponse.json({ error: pkgErr.message }, { status: 500 })

    // Normalise both shapes into one catalog list. price is the resolved B2B unit price; package
    // lines carry package_id + package_type so the order route can write/provision the right level.
    const singleRows = (singles ?? []).map(p => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      unit: p.unit,
      hsn_code: p.hsn_code,
      product_type: 'SINGLE',
      package_id: null,
      package_type: null,
      price: b2bPrice(p),
      availability: p.current_stock ?? 0,
      // Back-compat: the existing UI reads distributor_price directly for the unit price label.
      distributor_price: b2bPrice(p),
      current_stock: p.current_stock ?? 0,
    }))

    const pkgRows = (pkgs ?? [])
      .map(p => {
        const def = Array.isArray(p.product_packages) ? p.product_packages[0] : p.product_packages
        const price = b2bPrice(p)
        if (!def || price <= 0) return null   // skip levels with no usable B2B price
        return {
          id: p.id,
          name: p.name,
          sku: p.sku,
          unit: p.unit,
          hsn_code: p.hsn_code,
          product_type: 'PACKAGE',
          package_id: def.id,
          package_type: def.package_type,
          price,
          availability: p.current_stock ?? 0,
          distributor_price: price,
          current_stock: p.current_stock ?? 0,
        }
      })
      .filter(Boolean)

    const products = [...singleRows, ...pkgRows].sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({ products })
  } catch (err) {
    console.error('[console/suppliers/catalog] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
