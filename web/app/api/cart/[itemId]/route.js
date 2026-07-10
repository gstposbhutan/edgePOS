import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'
import { lineGst } from '@/lib/gst'

// PATCH: Update cart item quantity
export async function PATCH(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { supabase } = ctx
    const { itemId } = await params
    const { quantity } = await request.json()

    if (!quantity || quantity < 1) {
      return NextResponse.json({ error: 'Quantity must be at least 1' }, { status: 400 })
    }

    const { data: item } = await supabase
      .from('cart_items')
      .select('id, cart_id, unit_price, products(gst_exempt)')
      .eq('id', itemId)
      .single()

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    const exempt = !!(Array.isArray(item.products) ? item.products[0] : item.products)?.gst_exempt
    const gst = lineGst(parseFloat(item.unit_price) * quantity, exempt)
    const total = (parseFloat(item.unit_price) * quantity + gst).toFixed(2)

    const { error } = await supabase
      .from('cart_items')
      .update({ quantity, gst_5: gst, total })
      .eq('id', itemId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating cart item:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE: Remove cart item
export async function DELETE(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { supabase } = ctx
    const { itemId } = await params

    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('id', itemId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting cart item:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
