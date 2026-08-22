import { NextResponse } from 'next/server'
import { getAuthContext, getServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/products/brands
 * The SHARED brand / manufacturer list, common to all vendors / wholesalers / distributors —
 * distinct brand names across every shop's catalogue (brand lives only on public.products).
 * Auth-gated (any signed-in user) but read via the service client so it spans all entities,
 * not just the caller's. The product form uses it for "select existing or add new".
 */
export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const svc = getServiceClient()
    if (!svc) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })

    const { data, error } = await svc
      .from('products')
      .select('brand')
      .not('brand', 'is', null)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Case-insensitive de-dupe, keeping the first-seen canonical casing.
    const seen = new Map()
    for (const r of data || []) {
      const b = (r.brand || '').trim()
      if (!b) continue
      const key = b.toLowerCase()
      if (!seen.has(key)) seen.set(key, b)
    }
    const brands = [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))

    return NextResponse.json({ brands })
  } catch (err) {
    console.error('[products/brands] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
