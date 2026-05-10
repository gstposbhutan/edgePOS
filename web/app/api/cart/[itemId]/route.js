import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Create service client directly
function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
    }
  )
}

// PATCH: Update cart item quantity
export async function PATCH(request, { params }) {
  try {
    const cookieStore = await cookies()

    // Create server client with cookies
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          get(name) { return cookieStore.get(name)?.value },
          set(name, value, options) { cookieStore.set({ name, value, ...options }) },
          remove(name, options) { cookieStore.set({ name, value: '', ...options }) },
        },
      }
    )

    // Get session from cookies
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { itemId } = await params
    const body = await request.json()
    const { quantity } = body

    if (typeof quantity !== 'number' || quantity < 0) {
      return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 })
    }

    const customerPhone = session.user.user_metadata?.phone

    // Use service client for database queries
    const serviceClient = createServiceClient()

    // First, get just the cart item to verify it exists
    const { data: cartItem, error: itemError } = await serviceClient
      .from('cart_items')
      .select('*')
      .eq('id', itemId)
      .single()

    console.log('[CART PATCH] Item lookup result:', cartItem?.id, itemError)

    if (itemError || !cartItem) {
      console.error('[CART PATCH] Item not found:', itemId, itemError)
      return NextResponse.json({ error: 'Cart item not found' }, { status: 404 })
    }

    // Now get the cart to verify ownership
    const { data: cart, error: cartError } = await serviceClient
      .from('carts')
      .select('customer_whatsapp')
      .eq('id', cartItem.cart_id)
      .single()

    if (cartError || !cart) {
      console.error('[CART PATCH] Cart not found:', cartItem.cart_id, cartError)
      return NextResponse.json({ error: 'Cart not found' }, { status: 404 })
    }

    // Verify ownership
    if (cart.customer_whatsapp !== customerPhone) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (quantity === 0) {
      // Remove item
      const { error: deleteError } = await serviceClient
        .from('cart_items')
        .delete()
        .eq('id', itemId)

      if (deleteError) throw deleteError
    } else {
      // Update quantity
      const gst = (parseFloat(cartItem.unit_price) * 0.05 * quantity).toFixed(2)
      const total = (parseFloat(cartItem.unit_price) * quantity + parseFloat(gst)).toFixed(2)

      const { error: updateError } = await serviceClient
        .from('cart_items')
        .update({
          quantity,
          gst_5: gst,
          total: total
        })
        .eq('id', itemId)

      if (updateError) throw updateError
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating cart item:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE: Remove cart item
export async function DELETE(request, { params }) {
  try {
    const cookieStore = await cookies()

    // Create server client with cookies
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          get(name) { return cookieStore.get(name)?.value },
          set(name, value, options) { cookieStore.set({ name, value, ...options }) },
          remove(name, options) { cookieStore.set({ name, value: '', ...options }) },
        },
      }
    )

    // Get session from cookies
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { itemId } = await params
    const customerPhone = session.user.user_metadata?.phone

    console.log('[CART DELETE] Deleting item:', itemId, 'for phone:', customerPhone)

    // Use service client for database queries
    const serviceClient = createServiceClient()

    // First, get just the cart item to verify it exists
    const { data: cartItem, error: itemError } = await serviceClient
      .from('cart_items')
      .select('*, cart_id')
      .eq('id', itemId)
      .single()

    console.log('[CART DELETE] Item lookup result:', cartItem, itemError)

    if (itemError || !cartItem) {
      console.error('[CART DELETE] Item not found:', itemId, itemError)
      return NextResponse.json({ error: 'Cart item not found' }, { status: 404 })
    }

    // Now get the cart to verify ownership
    const { data: cart, error: cartError } = await serviceClient
      .from('carts')
      .select('customer_whatsapp')
      .eq('id', cartItem.cart_id)
      .single()

    console.log('[CART DELETE] Cart lookup result:', cart, cartError)

    if (cartError || !cart) {
      console.error('[CART DELETE] Cart not found:', cartItem.cart_id, cartError)
      return NextResponse.json({ error: 'Cart not found' }, { status: 404 })
    }

    // Verify ownership
    if (cart.customer_whatsapp !== customerPhone) {
      console.error('[CART DELETE] Ownership mismatch:', cart.customer_whatsapp, '!=', customerPhone)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { error: deleteError } = await serviceClient
      .from('cart_items')
      .delete()
      .eq('id', itemId)

    if (deleteError) throw deleteError

    console.log('[CART DELETE] Delete successful')
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting cart item:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
