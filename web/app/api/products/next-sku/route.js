import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'
import { nextUniqueSku } from '@/lib/products/sku'

/**
 * GET /api/products/next-sku
 * The SKU that would be auto-assigned to this vendor's next product if the SKU field is left
 * blank — continues their existing numbering series, else a default one. Used to preview the
 * value in the product form's SKU placeholder.
 */
export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const sku = await nextUniqueSku(ctx.supabase, ctx.entityId)
    return NextResponse.json({ sku })
  } catch (err) {
    console.error('[products/next-sku] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
