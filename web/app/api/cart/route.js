import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request) {
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

    const userId = session.user.id
    const customerPhone = session.user.user_metadata?.phone

    if (!customerPhone) {
      return NextResponse.json({ error: 'Customer phone not found' }, { status: 400 })
    }

    // Use service client for database queries (bypasses RLS for user data)
    const serviceClient = createServiceClient()

    // Get all active carts for this customer (grouped by retailer)
    const { data: carts, error: cartsError } = await serviceClient
      .from('carts')
      .select(`
        id,
        entity_id,
        status,
        created_at,
        entities!inner(id, name, whatsapp_no)
      `)
      .eq('customer_whatsapp', customerPhone)
      .eq('status', 'ACTIVE')

    if (cartsError) throw cartsError

    // Get cart items for each cart
    const cartsWithItems = await Promise.all(
      (carts || []).map(async (cart) => {
        const { data: items } = await serviceClient
          .from('cart_items')
          .select('*')
          .eq('cart_id', cart.id)
          .order('added_at', { ascending: true })

        return {
          ...cart,
          items: items || [],
          itemCount: (items || []).reduce((sum, item) => sum + item.quantity, 0),
          subtotal: (items || []).reduce((sum, item) => sum + parseFloat(item.total), 0)
        }
      })
    )

    return NextResponse.json({ carts: cartsWithItems })
  } catch (error) {
    console.error('Error fetching cart:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request) {
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

    const body = await request.json()
    const { productId, quantity = 1 } = body

    if (!productId) {
      return NextResponse.json({ error: 'Product ID required' }, { status: 400 })
    }

    const userId = session.user.id
    const customerPhone = session.user.user_metadata?.phone

    if (!customerPhone) {
      return NextResponse.json({ error: 'Customer phone not found' }, { status: 400 })
    }

    // Use service client for database queries
    const serviceClient = createServiceClient()

    // Get product details
    const { data: product, error: productError } = await serviceClient
      .from('products')
      .select('id, name, sku, mrp, created_by, current_stock')
      .eq('id', productId)
      .eq('is_active', true)
      .single()

    if (productError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    if (product.current_stock < quantity) {
      return NextResponse.json({ error: 'Insufficient stock' }, { status: 400 })
    }

    const retailerId = product.created_by

    // Find or create cart for this retailer
    let { data: cart, error: cartError } = await serviceClient
      .from('carts')
      .select('*')
      .eq('customer_whatsapp', customerPhone)
      .eq('entity_id', retailerId)
      .eq('status', 'ACTIVE')
      .single()

    if (cartError || !cart) {
      // Create new cart
      const { data: newCart, error: createError } = await serviceClient
        .from('carts')
        .insert({
          entity_id: retailerId,
          customer_whatsapp: customerPhone,
          status: 'ACTIVE',
          created_by: userId
        })
        .select()
        .single()

      if (createError) throw createError
      cart = newCart
    }

    // Check if product already in cart
    const { data: existingItem } = await serviceClient
      .from('cart_items')
      .select('*')
      .eq('cart_id', cart.id)
      .eq('product_id', productId)
      .single()

    if (existingItem) {
      // Update quantity
      const newQuantity = existingItem.quantity + quantity
      const gst = (parseFloat(product.mrp) * 0.05 * newQuantity).toFixed(2)
      const total = (parseFloat(product.mrp) * newQuantity + parseFloat(gst)).toFixed(2)

      const { error: updateError } = await serviceClient
        .from('cart_items')
        .update({
          quantity: newQuantity,
          gst_5: gst,
          total: total
        })
        .eq('id', existingItem.id)

      if (updateError) throw updateError
    } else {
      // Add new item
      const gst = (parseFloat(product.mrp) * 0.05 * quantity).toFixed(2)
      const total = (parseFloat(product.mrp) * quantity + parseFloat(gst)).toFixed(2)

      const { error: insertError } = await serviceClient
        .from('cart_items')
        .insert({
          cart_id: cart.id,
          product_id: productId,
          sku: product.sku,
          name: product.name,
          quantity: quantity,
          unit_price: product.mrp,
          gst_5: gst,
          total: total
        })

      if (insertError) throw insertError
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error adding to cart:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
