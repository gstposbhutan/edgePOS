"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"

/**
 * GST calculation on taxable (discounted) amount — Bhutan GST 2026.
 */
function calcItemTotals(unitPrice, discount, quantity) {
  const taxable = Math.max(0, unitPrice - discount)
  const gst5    = parseFloat((taxable * 0.05 * quantity).toFixed(2))
  const total   = parseFloat(((taxable * 1.05) * quantity).toFixed(2))
  return { gst5, total }
}

export function useCart(entityId, createdBy) {
  const supabase = createClient()

  const [cartId,   setCartId]   = useState(null)
  const [items,    setItems]    = useState([])
  const [customer, setCustomer] = useState(null)
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!entityId) return
    loadOrCreateCart()
  }, [entityId])

  async function loadOrCreateCart() {
    setLoading(true)
    const { data: existing } = await supabase
      .from('carts')
      .select(`
        id, customer_whatsapp, buyer_hash,
        cart_items (
          *,
          package_def:package_id (
            id, package_type,
            package_items (
              quantity,
              product:product_id (name, unit)
            )
          )
        )
      `)
      .eq('entity_id', entityId)
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (existing) {
      setCartId(existing.id)
      setItems(existing.cart_items ?? [])
      setCustomer({ whatsapp: existing.customer_whatsapp, buyerHash: existing.buyer_hash })
    } else {
      const { data: newCart } = await supabase
        .from('carts')
        .insert({ entity_id: entityId, created_by: createdBy, status: 'ACTIVE' })
        .select('id').single()
      if (newCart) setCartId(newCart.id)
      setItems([])
      setCustomer(null)
    }
    setLoading(false)
  }

  // ── Add product OR package to cart ────────────────────────────────────────
  // product.package_def_id indicates it's a package product from sellable_products view
  const addItem = useCallback(async (product) => {
    if (!cartId) return

    const unitPrice   = parseFloat(product.mrp ?? product.wholesale_price ?? 0)
    const packageId   = product.package_def_id ?? null
    const { gst5, total } = calcItemTotals(unitPrice, 0, 1)

    // Dedup: match by package_id (for packages) or product_id (for singles)
    const existing = packageId
      ? items.find(i => i.package_id === packageId)
      : items.find(i => i.product_id === product.id && !i.package_id)

    if (existing) return updateQty(existing.id, existing.quantity + 1)

    const { data: newItem } = await supabase
      .from('cart_items')
      .insert({
        cart_id:    cartId,
        product_id: product.id,
        package_id: packageId,
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
        package_def:package_id (
          id, package_type,
          package_items (
            quantity,
            product:product_id (name, unit)
          )
        )
      `)
      .single()

    if (newItem) setItems(prev => [...prev, newItem])
  }, [cartId, items])

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
      .select(`
        *,
        package_def:package_id (
          id, package_type,
          package_items (quantity, product:product_id (name, unit))
        )
      `)
      .single()

    if (updated) setItems(prev => prev.map(i => i.id === itemId ? updated : i))
  }, [items])

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
      .select(`*, package_def:package_id (id, package_type, package_items (quantity, product:product_id (name, unit)))`)
      .single()

    if (updated) setItems(prev => prev.map(i => i.id === itemId ? updated : i))
  }, [items])

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
      .select(`*, package_def:package_id (id, package_type, package_items (quantity, product:product_id (name, unit)))`)
      .single()

    if (updated) setItems(prev => prev.map(i => i.id === itemId ? updated : i))
  }, [items])

  // ── Remove item ────────────────────────────────────────────────────────────
  const removeItem = useCallback(async (itemId) => {
    await supabase.from('cart_items').delete().eq('id', itemId)
    setItems(prev => prev.filter(i => i.id !== itemId))
  }, [])

  // ── Clear cart ─────────────────────────────────────────────────────────────
  const clearCart = useCallback(async () => {
    if (!cartId) return
    await supabase.from('cart_items').delete().eq('cart_id', cartId)
    setItems([])
    setCustomer(null)
    await loadOrCreateCart()
  }, [cartId, entityId])

  // ── Set customer ───────────────────────────────────────────────────────────
  const setCustomerIdentity = useCallback(async ({ whatsapp, buyerHash }) => {
    if (!cartId) return
    await supabase.from('carts')
      .update({ customer_whatsapp: whatsapp, buyer_hash: buyerHash })
      .eq('id', cartId)
    setCustomer({ whatsapp, buyerHash })
  }, [cartId])

  // ── Derived totals ─────────────────────────────────────────────────────────
  const subtotal      = items.reduce((s, i) => s + parseFloat(i.unit_price) * i.quantity, 0)
  const discountTotal = items.reduce((s, i) => s + parseFloat(i.discount ?? 0) * i.quantity, 0)
  const taxableSubtotal = subtotal - discountTotal
  const gstTotal      = items.reduce((s, i) => s + parseFloat(i.gst_5), 0)
  const grandTotal    = items.reduce((s, i) => s + parseFloat(i.total), 0)

  return {
    cartId, items, customer, loading,
    subtotal:        parseFloat(subtotal.toFixed(2)),
    discountTotal:   parseFloat(discountTotal.toFixed(2)),
    taxableSubtotal: parseFloat(taxableSubtotal.toFixed(2)),
    gstTotal:        parseFloat(gstTotal.toFixed(2)),
    grandTotal:      parseFloat(grandTotal.toFixed(2)),
    addItem, updateQty, applyDiscount, overridePrice, removeItem, clearCart, setCustomerIdentity,
  }
}
