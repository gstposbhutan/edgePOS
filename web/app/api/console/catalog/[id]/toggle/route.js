import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/**
 * POST /api/console/catalog/[id]/toggle — flip a product's active flag.
 * Scoped to the caller's own products via `.eq('created_by', entityId)`, so a vendor can only
 * toggle what they own. Only `is_active` is togglable here (the console catalog does not expose
 * the POS-only package/web flags).
 */
export async function POST(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { id } = await params
    const { entityId, supabase } = ctx
    const { value } = await request.json()

    const { data: updated, error } = await supabase
      .from('products')
      .update({ is_active: !!value })
      .eq('id', id)
      .eq('created_by', entityId)
      .select('id')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[console/catalog/[id]/toggle] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
