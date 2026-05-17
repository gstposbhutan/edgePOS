"use client"

import { useState, useEffect, useCallback } from "react"

function calcItemTotals(unitPrice, discount, quantity) {
  const taxable = Math.max(0, unitPrice - discount)
  const gst5    = parseFloat((taxable * 0.05 * quantity).toFixed(2))
  const total   = parseFloat(((taxable * 1.05) * quantity).toFixed(2))
  return { gst5, total }
}

export function useCart(entityId, createdBy) {
  const [carts,       setCarts]       = useState([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [loading,     setLoading]     = useState(true)

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
    try {
      const res = await fetch('/api/pos/cart')
      if (res.ok) {
        const data = await res.json()
        setCarts(data.carts ?? [])
        setActiveIndex(0)
      }
    } catch { /* silently fail */ }
    setLoading(false)
  }

  async function createNewCart() {
    try {
      const res = await fetch('/api/pos/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create' }),
      })
      if (res.ok) {
        const data = await res.json()
        return data.cart ?? null
      }
    } catch { /* silently fail */ }
    return null
  }

  const holdCart = useCallback(async () => {
    const newCart = await createNewCart()
    if (!newCart) return
    setCarts(prev => [...prev, newCart])
    setActiveIndex(carts.length)
  }, [carts.length])

  const switchCart = useCallback((index) => {
    if (index >= 0 && index < carts.length) setActiveIndex(index)
  }, [carts])

  const cancelCart = useCallback(async (indexOrId) => {
    const index = typeof indexOrId === 'number'
      ? indexOrId
      : carts.findIndex(c => c.id === indexOrId)
    const cart = carts[index]
    if (!cart) return

    try {
      await fetch('/api/pos/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'abandon', cartId: cart.id }),
      })
    } catch { /* silently fail */ }

    const next = carts.filter((_, i) => i !== index)

    if (next.length === 0) {
      const fresh = await createNewCart()
      setCarts(fresh ? [fresh] : [])
      setActiveIndex(0)
    } else {
      setCarts(next)
      setActiveIndex(Math.min(activeIndex, next.length - 1))
    }
  }, [carts, activeIndex])

  const addItem = useCallback(async (product) => {
    if (!cartId) return

    const unitPrice = parseFloat(product.selling_price ?? product.mrp ?? product.wholesale_price ?? 0)
    const batchId   = product.batch_id ?? null

    // Dedup: same product + same batch = merge quantity
    const existing = items.find(i =>
      i.product_id === product.id &&
      !i.package_id &&
      (i.batch_id ?? null) === (batchId ?? null)
    )

    if (existing) return updateQty(existing.id, existing.quantity + 1)

    try {
      const res = await fetch('/api/pos/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', cartId, product }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.item) {
          setCarts(prev => prev.map((c, i) =>
            i === activeIndex
              ? { ...c, cart_items: [...c.cart_items, data.item] }
              : c
          ))
        }
      }
    } catch { /* silently fail */ }
  }, [cartId, items, activeIndex])

  const updateQty = useCallback(async (itemId, newQty) => {
    if (newQty < 1) return removeItem(itemId)

    try {
      const res = await fetch('/api/pos/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_qty', itemId, quantity: newQty }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.item) {
          setCarts(prev => prev.map((c, i) =>
            i === activeIndex
              ? { ...c, cart_items: c.cart_items.map(ci => ci.id === itemId ? data.item : ci) }
              : c
          ))
        }
      }
    } catch { /* silently fail */ }
  }, [activeIndex])

  const applyDiscount = useCallback(async (itemId, input) => {
    const item = items.find(i => i.id === itemId)
    if (!item) return
    const unitPrice = parseFloat(item.unit_price)

    let discountType, discountValue, discountPerUnit
    if (typeof input === 'object' && input !== null) {
      discountType = input.type || 'FLAT'
      discountValue = parseFloat(input.value) || 0
      if (discountType === 'PERCENTAGE') {
        discountPerUnit = unitPrice * (Math.min(discountValue, 100) / 100)
      } else {
        discountPerUnit = discountValue
      }
    } else {
      discountType = 'FLAT'
      discountValue = parseFloat(input) || 0
      discountPerUnit = discountValue
    }

    const clamped = Math.min(Math.max(0, discountPerUnit), unitPrice)

    try {
      const res = await fetch('/api/pos/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'discount', itemId, discount: clamped, discountType, discountValue }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.item) {
          setCarts(prev => prev.map((c, i) =>
            i === activeIndex
              ? { ...c, cart_items: c.cart_items.map(ci => ci.id === itemId ? data.item : ci) }
              : c
          ))
        }
      }
    } catch { /* silently fail */ }
  }, [items, activeIndex])

  const overridePrice = useCallback(async (itemId, newUnitPrice) => {
    try {
      const res = await fetch('/api/pos/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'override_price', itemId, unitPrice: newUnitPrice }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.item) {
          setCarts(prev => prev.map((c, i) =>
            i === activeIndex
              ? { ...c, cart_items: c.cart_items.map(ci => ci.id === itemId ? data.item : ci) }
              : c
          ))
        }
      }
    } catch { /* silently fail */ }
  }, [activeIndex])

  const removeItem = useCallback(async (itemId) => {
    try {
      await fetch('/api/pos/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', itemId }),
      })
    } catch { /* silently fail */ }

    setCarts(prev => prev.map((c, i) =>
      i === activeIndex
        ? { ...c, cart_items: c.cart_items.filter(ci => ci.id !== itemId) }
        : c
    ))
  }, [activeIndex])

  const clearCart = useCallback(async () => {
    if (!cartId) return
    try {
      const res = await fetch('/api/pos/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear', cartId }),
      })
      if (res.ok) {
        const data = await res.json()
        setCarts(prev => {
          const next = [...prev]
          next[activeIndex] = data.cart ?? { id: null, cart_items: [], customer_whatsapp: null, buyer_hash: null }
          return next
        })
      }
    } catch { /* silently fail */ }
  }, [cartId, activeIndex])

  const setCustomerIdentity = useCallback(async ({ whatsapp, buyerHash }) => {
    if (!cartId) return
    try {
      await fetch('/api/pos/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_customer', cartId, whatsapp, buyerHash }),
      })
    } catch { /* silently fail */ }

    setCarts(prev => prev.map((c, i) =>
      i === activeIndex
        ? { ...c, customer_whatsapp: whatsapp, buyer_hash: buyerHash }
        : c
    ))
  }, [cartId, activeIndex])

  const subtotal        = items.reduce((s, i) => s + parseFloat(i.unit_price) * i.quantity, 0)
  const discountTotal   = items.reduce((s, i) => s + parseFloat(i.discount ?? 0) * i.quantity, 0)
  const taxableSubtotal = subtotal - discountTotal
  const gstTotal        = items.reduce((s, i) => s + parseFloat(i.gst_5), 0)
  const grandTotal      = items.reduce((s, i) => s + parseFloat(i.total), 0)

  return {
    cartId, items, customer, loading,
    subtotal:        parseFloat(subtotal.toFixed(2)),
    discountTotal:   parseFloat(discountTotal.toFixed(2)),
    taxableSubtotal: parseFloat(taxableSubtotal.toFixed(2)),
    gstTotal:        parseFloat(gstTotal.toFixed(2)),
    grandTotal:      parseFloat(grandTotal.toFixed(2)),
    carts,
    activeIndex,
    holdCart,
    switchCart,
    cancelCart,
    addItem, updateQty, applyDiscount, overridePrice, removeItem, clearCart, setCustomerIdentity,
  }
}
