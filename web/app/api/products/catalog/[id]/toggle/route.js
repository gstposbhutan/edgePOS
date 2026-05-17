import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/** POST /api/products/catalog/[id]/toggle — toggle product flags */
export async function POST(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const supabase = ctx.supabase
    const { field, value } = await request.json()

    const { error } = await supabase
      .from('products')
      .update({ [field]: value })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[products/catalog/[id]/toggle] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
