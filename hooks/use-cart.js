"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"

function calcItemTotals(unitPrice, discount, quantity) {
  const taxable = Math.max(0, unitPrice - discount)
  const gst5    = parseFloat((taxable * 0.05 * quantity).toFixed(2))
  const total   = parseFloat(((taxable * 1.05) * quantity).toFixed(2))
  return { gst5, total }
}

const CART_SELECT = `
  id, customer_whatsapp, buyer_hash, created_at,
  cart_items (
    *,
    batch:batch_id (id, batch_number, expires_at, mrp, selling_price, available_qty:quantity),
    package_def:package_id (
      id, package_type,
      package_items (
        quantity,
        product:product_id (name, unit)
      )
    )
  )
`

export function useCart(entityId, createdBy) {
  const supabase = createClient()

  // All ACTIVE carts for this entity
  const [carts,       setCarts]       = useState([])   // [{ id, customer_whatsapp, buyer_hash, cart_items[] }]
  const [activeIndex, setActiveIndex] = useState(0)    // which cart the cashier is working on
  const [loading,     setLoading]     = useState(true)

  // Derived from carts[activeIndex]
  const activeCart = carts[activeIndex] ?? null
  const cartId     = activeCart?.id   ?? null
  const items      = activeCart?.cart_items ?? []
  const customer   = activeCart
    ? { whatsapp: activeCart.customer_whatsapp, buyerHash: activeCart.buyer_hash }
    : null

  useEffect(() => {
    if (!entityId) return
    loadCarts()
  }, [entityId])

  async function loadCarts() {
    setLoading(true)
    const { data: existing } = await supabase
      .from('carts')
      .select(CART_SELECT)
      .eq('entity_id', entityId)
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: true })

    if (existing?.length) {
      const normalized = existing.map(c => ({
        ...c,
        customer_whatsapp: null, // never restore — cashier identifies fresh each time
        buyer_hash: null,
        cart_items: c.cart_items ?? [],
      }))
      setCarts(normalized)
      setActiveIndex(0)
    } else {
      const newCart = await createNewCart()
      if (newCart) {
        setCarts([newCart])
        setActiveIndex(0)
      }
    }
    setLoading(false)
  }

  async function createNewCart() {
    const { data } = await supabase
      .from('carts')
      .insert({ entity_id: entityId, created_by: createdBy, status: 'ACTIVE' })
      .select(CART_SELECT)
      .single()
    return data ? { ...data, cart_items: data.cart_items ?? [] } : null
  }

  // ── Hold current cart and open a new blank one ─────────────────────────────
  const holdCart = useCallback(async () => {
    const newCart = await createNewCart()
    if (!newCart) return
    setCarts(prev => [...prev, newCart])
    setActiveIndex(prev => prev + 1 < (carts.length + 1) ? carts.length : prev)
    // Switch to the new blank cart
    setActiveIndex(carts.length)
  }, [carts, entityId, createdBy])

  // ── Switch to a different held cart by index ───────────────────────────────
  const switchCart = useCallback((index) => {
    if (index >= 0 && index < carts.length) setActiveIndex(index)
  }, [carts])

  // ── Cancel / clear a cart (abandon it, remove items) ──────────────────────
  const cancelCart = useCallback(async (indexOrId) => {
    const index = typeof indexOrId === 'number'
      ? indexOrId
      : carts.findIndex(c => c.id === indexOrId)
    const cart = carts[index]
    if (!cart) return

    // Delete items and mark cart ABANDONED
    await supabase.from('cart_items').delete().eq('cart_id', cart.id)
    await supabase.from('carts').update({ status: 'ABANDONED' }).eq('id', cart.id)

    const next = carts.filter((_, i) => i !== index)

    if (next.length === 0) {
      // Create a fresh cart so POS is never left empty
      const fresh = await createNewCart()
      setCarts(fresh ? [fresh] : [])
      setActiveIndex(0)
    } else {
      setCarts(next)
      setActiveIndex(Math.min(activeIndex, next.length - 1))
    }
  }, [carts, activeIndex, entityId, createdBy])

  // ── Add product OR package to active cart ─────────────────────────────────
  const addItem = useCallback(async (product) => {
    if (!cartId) return

    // Use selling_price as the billing price; fall back to mrp then wholesale_price
    const unitPrice = parseFloat(product.selling_price ?? product.mrp ?? product.wholesale_price ?? 0)
    const packageId = product.package_def_id ?? null
    const batchId   = product.batch_id ?? null
    const { gst5, total } = calcItemTotals(unitPrice, 0, 1)

    // Dedup: same product + same batch = merge quantity
    const existing = packageId
      ? items.find(i => i.package_id === packageId)
      : items.find(i =>
          i.product_id === product.id &&
          !i.package_id &&
          (i.batch_id ?? null) === (batchId ?? null)
        )

    if (existing) return updateQty(existing.id, existing.quantity + 1)

    const { data: newItem } = await supabase
      .from('cart_items')
      .insert({
        cart_id:    cartId,
        product_id: product.id,
        package_id: packageId,
        batch_id:   batchId,
        name:       product.name,
        sku:        product.sku ?? null,
        quantity:   1,
        unit_price: unitPrice,
        discount:   0,
        gst_5:      gst5,
        total,
      })
      .select(`
        *,
        batch:batch_id (id, batch_number, expires_at, mrp, selling_price, available_qty:quantity),
        package_def:package_id (
          id, package_type,
          package_items (quantity, product:product_id (name, unit))
        )
      `)
      .single()

    if (newItem) {
      setCarts(prev => prev.map((c, i) =>
        i === activeIndex
          ? { ...c, cart_items: [...c.cart_items, newItem] }
          : c
      ))
    }
  }, [cartId, items, activeIndex])

  // ── Update quantity ────────────────────────────────────────────────────────
  const updateQty = useCallback(async (itemId, newQty) => {
    if (newQty < 1) return removeItem(itemId)
    const item = items.find(i => i.id === itemId)
    if (!item) return

    const { gst5, total } = calcItemTotals(
      parseFloat(item.unit_price),
      parseFloat(item.discount ?? 0),
      newQty
    )

    const { data: updated } = await supabase
      .from('cart_items')
      .update({ quantity: newQty, gst_5: gst5, total })
      .eq('id', itemId)
      .select(`*, batch:batch_id (id, batch_number, expires_at, mrp, selling_price), package_def:package_id (id, package_type, package_items (quantity, product:product_id (name, unit)))`)
      .single()

    if (updated) {
      setCarts(prev => prev.map((c, i) =>
        i === activeIndex
          ? { ...c, cart_items: c.cart_items.map(ci => ci.id === itemId ? updated : ci) }
          : c
      ))
    }
  }, [items, activeIndex])

  // ── Apply discount ─────────────────────────────────────────────────────────
  const applyDiscount = useCallback(async (itemId, discountPerUnit) => {
    const item = items.find(i => i.id === itemId)
    if (!item) return
    const unitPrice = parseFloat(item.unit_price)
    const clamped   = Math.min(Math.max(0, discountPerUnit), unitPrice)
    const { gst5, total } = calcItemTotals(unitPrice, clamped, item.quantity)

    const { data: updated } = await supabase
      .from('cart_items')
      .update({ discount: clamped, gst_5: gst5, total })
      .eq('id', itemId)
      .select(`*, batch:batch_id (id, batch_number, expires_at, mrp, selling_price), package_def:package_id (id, package_type, package_items (quantity, product:product_id (name, unit)))`)
      .single()

    if (updated) {
      setCarts(prev => prev.map((c, i) =>
        i === activeIndex
          ? { ...c, cart_items: c.cart_items.map(ci => ci.id === itemId ? updated : ci) }
          : c
      ))
    }
  }, [items, activeIndex])

  // ── Override price ─────────────────────────────────────────────────────────
  const overridePrice = useCallback(async (itemId, newUnitPrice) => {
    const item  = items.find(i => i.id === itemId)
    if (!item) return
    const price = Math.max(0, parseFloat(newUnitPrice))
    const { gst5, total } = calcItemTotals(price, parseFloat(item.discount ?? 0), item.quantity)

    const { data: updated } = await supabase
      .from('cart_items')
      .update({ unit_price: price, gst_5: gst5, total })
      .eq('id', itemId)
      .select(`*, batch:batch_id (id, batch_number, expires_at, mrp, selling_price), package_def:package_id (id, package_type, package_items (quantity, product:product_id (name, unit)))`)
      .single()

    if (updated) {
      setCarts(prev => prev.map((c, i) =>
        i === activeIndex
          ? { ...c, cart_items: c.cart_items.map(ci => ci.id === itemId ? updated : ci) }
          : c
      ))
    }
  }, [items, activeIndex])

  // ── Remove item ────────────────────────────────────────────────────────────
  const removeItem = useCallback(async (itemId) => {
    await supabase.from('cart_items').delete().eq('id', itemId)
    setCarts(prev => prev.map((c, i) =>
      i === activeIndex
        ? { ...c, cart_items: c.cart_items.filter(ci => ci.id !== itemId) }
        : c
    ))
  }, [activeIndex])

  // ── Clear active cart (keep the cart slot, just empty it) ─────────────────
  const clearCart = useCallback(async () => {
    if (!cartId) return
    await supabase.from('cart_items').delete().eq('cart_id', cartId)
    // After checkout, replace this cart slot with a fresh one
    await supabase.from('carts').update({ status: 'CONVERTED' }).eq('id', cartId)
    const newCart = await createNewCart()
    setCarts(prev => {
      const next = [...prev]
      next[activeIndex] = newCart ?? { id: null, cart_items: [], customer_whatsapp: null, buyer_hash: null }
      return next
    })
  }, [cartId, activeIndex, entityId, createdBy])

  // ── Set customer on active cart ────────────────────────────────────────────
  const setCustomerIdentity = useCallback(async ({ whatsapp, buyerHash }) => {
    if (!cartId) return
    await supabase.from('carts')
      .update({ customer_whatsapp: whatsapp, buyer_hash: buyerHash })
      .eq('id', cartId)
    setCarts(prev => prev.map((c, i) =>
      i === activeIndex
        ? { ...c, customer_whatsapp: whatsapp, buyer_hash: buyerHash }
        : c
    ))
  }, [cartId, activeIndex])

  // ── Derived totals for active cart ────────────────────────────────────────
  const subtotal        = items.reduce((s, i) => s + parseFloat(i.unit_price) * i.quantity, 0)
  const discountTotal   = items.reduce((s, i) => s + parseFloat(i.discount ?? 0) * i.quantity, 0)
  const taxableSubtotal = subtotal - discountTotal
  const gstTotal        = items.reduce((s, i) => s + parseFloat(i.gst_5), 0)
  const grandTotal      = items.reduce((s, i) => s + parseFloat(i.total), 0)

  return {
    // Active cart
    cartId, items, customer, loading,
    subtotal:        parseFloat(subtotal.toFixed(2)),
    discountTotal:   parseFloat(discountTotal.toFixed(2)),
    taxableSubtotal: parseFloat(taxableSubtotal.toFixed(2)),
    gstTotal:        parseFloat(gstTotal.toFixed(2)),
    grandTotal:      parseFloat(grandTotal.toFixed(2)),
    // Multi-cart
    carts,
    activeIndex,
    holdCart,
    switchCart,
    cancelCart,
    // Item ops
    addItem, updateQty, applyDiscount, overridePrice, removeItem, clearCart, setCustomerIdentity,
  }
}
