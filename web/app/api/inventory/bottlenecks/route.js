import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/** GET /api/inventory/bottlenecks — products bottlenecking active packages */
export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { supabase } = ctx

    const { data: activePackages } = await supabase
      .from('product_packages')
      .select('id, name, package_items(product_id, quantity)')
      .eq('is_active', true)

    if (!activePackages?.length) return NextResponse.json({ bottlenecks: [] })

    // Collect all product IDs referenced by packages
    const productIds = [...new Set(
      activePackages.flatMap(pkg => (pkg.package_items ?? []).map(i => i.product_id))
    )]

    if (!productIds.length) return NextResponse.json({ bottlenecks: [] })

    const { data: products } = await supabase
      .from('products')
      .select('id, name, current_stock')
      .in('id', productIds)

    const productMap = Object.fromEntries((products ?? []).map(p => [p.id, p]))

    const bottlenecks = []
    for (const pkg of activePackages) {
      for (const item of pkg.package_items ?? []) {
        const product = productMap[item.product_id]
        if (product && product.current_stock < item.quantity) {
          bottlenecks.push({
            packageName: pkg.name,
            productName: product.name,
            needed: item.quantity,
            available: product.current_stock,
          })
        }
      }
    }

    return NextResponse.json({ bottlenecks })
  } catch (err) {
    console.error('[inventory/bottlenecks] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
