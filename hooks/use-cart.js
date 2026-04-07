"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"

/**
 * Calculates GST and totals for a cart item.
 * GST is always calculated on (unit_price - discount) — Bhutan GST 2026.
 *
 * @param {number} unitPrice
 * @param {number} discount - per-unit discount amount
 * @param {number} quantity
 * @returns {{ gst5: number, total: number, taxableAmount: number }}
 */
function calcItemTotals(unitPrice, discount, quantity) {
  const taxablePerUnit = Math.max(0, unitPrice - discount)
  const gst5           = parseFloat((taxablePerUnit * 0.05 * quantity).toFixed(2))
  const total          = parseFloat(((taxablePerUnit + taxablePerUnit * 0.05) * quantity).toFixed(2))
  const taxableAmount  = parseFloat((taxablePerUnit * quantity).toFixed(2))
  return { gst5, total, taxableAmount }
}

/**
 * Manages a persisted POS cart for the current store session.
 * @param {string} entityId - The store's entity UUID
 * @param {string|null} createdBy - The cashier's user_profile UUID
 */
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
      .select('id, customer_whatsapp, buyer_hash, cart_items(*)')
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
        .select('id')
        .single()
      if (newCart) setCartId(newCart.id)
      setItems([])
      setCustomer(null)
    }
    setLoading(false)
  }

  // ── Add or increment item ──────────────────────────────────────────────────
  const addItem = useCallback(async (product) => {
    if (!cartId) return
    const unitPrice = parseFloat(product.mrp ?? product.wholesale_price ?? 0)
    const discount  = 0
    const { gst5, total } = calcItemTotals(unitPrice, discount, 1)

    const existing = items.find(i => i.product_id === product.id)
    if (existing) {
      return updateQty(existing.id, existing.quantity + 1)
    }

    const { data: newItem } = await supabase
      .from('cart_items')
      .insert({ cart_id: cartId, product_id: product.id, sku: product.sku, name: product.name,
                quantity: 1, unit_price: unitPrice, discount, gst_5: gst5, total })
      .select().single()

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
      .eq('id', itemId).select().single()

    if (updated) setItems(prev => prev.map(i => i.id === itemId ? updated : i))
  }, [items])

  // ── Apply per-item discount ────────────────────────────────────────────────
  // discount is a fixed amount per unit (e.g. Nu 10 off per item)
  const applyDiscount = useCallback(async (itemId, discountPerUnit) => {
    const item = items.find(i => i.id === itemId)
    if (!item) return

    const unitPrice = parseFloat(item.unit_price)
    // Discount cannot exceed unit price
    const clampedDiscount = Math.min(Math.max(0, discountPerUnit), unitPrice)
    const { gst5, total } = calcItemTotals(unitPrice, clampedDiscount, item.quantity)

    const { data: updated } = await supabase
      .from('cart_items')
      .update({ discount: clampedDiscount, gst_5: gst5, total })
      .eq('id', itemId).select().single()

    if (updated) setItems(prev => prev.map(i => i.id === itemId ? updated : i))
  }, [items])

  // ── Override unit price (manager permission required in UI) ───────────────
  const overridePrice = useCallback(async (itemId, newUnitPrice) => {
    const item = items.find(i => i.id === itemId)
    if (!item) return

    const price    = Math.max(0, parseFloat(newUnitPrice))
    const discount = parseFloat(item.discount ?? 0)
    const { gst5, total } = calcItemTotals(price, discount, item.quantity)

    const { data: updated } = await supabase
      .from('cart_items')
      .update({ unit_price: price, gst_5: gst5, total })
      .eq('id', itemId).select().single()

    if (updated) setItems(prev => prev.map(i => i.id === itemId ? updated : i))
  }, [items])

  // ── Remove item (void) ─────────────────────────────────────────────────────
  const removeItem = useCallback(async (itemId) => {
    await supabase.from('cart_items').delete().eq('id', itemId)
    setItems(prev => prev.filter(i => i.id !== itemId))
  }, [])

  // ── Clear entire cart ──────────────────────────────────────────────────────
  const clearCart = useCallback(async () => {
    if (!cartId) return
    await supabase.from('cart_items').delete().eq('cart_id', cartId)
    setItems([])
    setCustomer(null)
    await loadOrCreateCart()
  }, [cartId, entityId])

  // ── Set customer identity ──────────────────────────────────────────────────
  const setCustomerIdentity = useCallback(async ({ whatsapp, buyerHash }) => {
    if (!cartId) return
    await supabase.from('carts')
      .update({ customer_whatsapp: whatsapp, buyer_hash: buyerHash })
      .eq('id', cartId)
    setCustomer({ whatsapp, buyerHash })
  }, [cartId])

  // ── Derived totals (GST on discounted price) ───────────────────────────────
  const taxableSubtotal = items.reduce((sum, i) => {
    const taxable = Math.max(0, parseFloat(i.unit_price) - parseFloat(i.discount ?? 0))
    return sum + taxable * i.quantity
  }, 0)
  const discountTotal = items.reduce((sum, i) => sum + parseFloat(i.discount ?? 0) * i.quantity, 0)
  const gstTotal      = items.reduce((sum, i) => sum + parseFloat(i.gst_5), 0)
  const grandTotal    = items.reduce((sum, i) => sum + parseFloat(i.total), 0)
  const subtotal      = items.reduce((sum, i) => sum + parseFloat(i.unit_price) * i.quantity, 0)

  return {
    cartId, items, customer, loading,
    subtotal:      parseFloat(subtotal.toFixed(2)),
    discountTotal: parseFloat(discountTotal.toFixed(2)),
    taxableSubtotal: parseFloat(taxableSubtotal.toFixed(2)),
    gstTotal:      parseFloat(gstTotal.toFixed(2)),
    grandTotal:    parseFloat(grandTotal.toFixed(2)),
    addItem, updateQty, applyDiscount, overridePrice, removeItem, clearCart, setCustomerIdentity,
  }
}
