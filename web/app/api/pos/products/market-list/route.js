import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/**
 * POST /api/pos/products/market-list — "Post to Market" v1 (Alt+M). Marks the
 * given products visible on the consumer marketplace (products.visible_on_web).
 * The product ids come from the merchant's own cart; RLS enforces tenant scope.
 * Body: { product_ids: string[] }
 */
export async function POST(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { product_ids } = await request.json()
  if (!Array.isArray(product_ids) || product_ids.length === 0) {
    return NextResponse.json({ error: 'product_ids required' }, { status: 400 })
  }

  const { error } = await ctx.supabase
    .from('products')
    .update({ visible_on_web: true })
    .in('id', product_ids)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ listed: product_ids.length })
}
