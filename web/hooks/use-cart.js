"use client"

import { useState, useEffect, useCallback } from "react"

function calcItemTotals(unitPrice, discount, quantity) {
  const taxable = Math.max(0, unitPrice - discount)
  const gst5    = parseFloat((taxable * 0.05 * quantity).toFixed(2))
  const total   = parseFloat(((taxable * 1.05) * quantity).toFixed(2))
  return { gst5, total }
}

// Per-unit price for a product under the active POS price list. Retail = batch
// selling price → MRP → wholesale (legacy fallback); Wholesale = wholesale_price;
// Distributor = distributor_price (→ wholesale → mrp when unset). Never NaN.
function priceFor(product, mode) {
  const num = v => parseFloat(v ?? 0) || 0
  if (mode === 'WHOLESALE')   return num(product.wholesale_price)   || num(product.mrp)
  if (mode === 'DISTRIBUTOR') return num(product.distributor_price) || num(product.wholesale_price) || num(product.mrp)
  return num(product.selling_price) || num(product.mrp) || num(product.wholesale_price)
}

// `onStockCap(name, available)` — optional. Fired when the server clamps a line's
// quantity down to the available stock (hard stock cap), so the page can toast
// "Only N in stock". Untracked-stock products never trigger it.
export function useCart(entityId, createdBy, priceListMode = 'RETAIL', onStockCap) {
  const [carts,       setCarts]       = useState([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [loading,     setLoading]     = useState(true)

  const activeCart = carts[activeIndex] ?? null
  const cartId     = activeCart?.id   ?? null
  const items      = activeCart?.cart_items ?? []
  const customer   = activeCart
    ? { whatsapp: activeCart.customer_whatsapp, buyerHash: activeCart.buyer_hash }
    : null
  const rawBillDiscount = Math.max(0, parseFloat(activeCart?.bill_discount ?? 0) || 0)

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

  const addItem = useCallback(async (product, modeOverride) => {
    if (!cartId) return

    // Per-line rate: the product-search rate toggle passes a tier for THIS line; fall back to the
    // invoice default when unspecified. The server stores this tier price as the line unit_price.
    const unitPrice = priceFor(product, modeOverride || priceListMode)
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
        body: JSON.stringify({ action: 'add', cartId, product: { ...product, unitPrice } }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.item) {
          setCarts(prev => prev.map((c, i) =>
            i === activeIndex
              ? { ...c, cart_items: [...c.cart_items, data.item] }
              : c
          ))
          if (data.stockCapped) onStockCap?.(data.item.name ?? product.name, data.available)
        }
      }
    } catch { /* silently fail */ }
  }, [cartId, items, activeIndex, priceListMode, onStockCap])

  const updateQty = useCallback(async (itemId, newQty) => {
    if (newQty < 1) return removeItem(itemId)

    // Send the requested qty as-is and let the server be the single source of
    // truth for the hard stock cap — it clamps and reports back via stockCapped
    // (this also covers packages and any stale client stock). The displayed qty
    // only re-renders from the returned data.item, so the over-stock number is
    // never actually committed to the cart.
    const item = items.find(i => i.id === itemId)
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
          if (data.stockCapped) onStockCap?.(data.item.name ?? item?.name, data.available)
        }
      }
    } catch { /* silently fail */ }
  }, [items, activeIndex, onStockCap])

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

  // Re-price every line in the active cart to the given price list: fetch the
  // product ladder once (batched via ?ids=), then overridePrice each item whose
  // price actually changed. Per-line discounts are preserved (override_price
  // recomputes gst/total against the new price, see api/pos/cart/items).
  const repriceCart = useCallback(async (mode) => {
    if (!items.length) return
    const ids = [...new Set(items.map(i => i.product_id).filter(Boolean))]
    if (!ids.length) return
    try {
      const res = await fetch(`/api/pos/products?ids=${encodeURIComponent(ids.join(','))}`)
      if (!res.ok) return
      const { products = [] } = await res.json()
      const byId = new Map(products.map(p => [p.id, p]))
      for (const item of items) {
        const prod = byId.get(item.product_id)
        if (!prod) continue
        const newPrice = priceFor(prod, mode)
        if (Number.isFinite(newPrice) && Math.abs(newPrice - parseFloat(item.unit_price)) > 0.001) {
          await overridePrice(item.id, newPrice)
        }
      }
    } catch { /* silently fail */ }
  }, [items, overridePrice])

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

  // Invoice/bill-level discount: a single pre-GST amount off the net subtotal (NOT distributed
  // across lines). Stored on the cart via the set_bill_discount action.
  const applyBillDiscount = useCallback(async (amount) => {
    if (!cartId) return
    const billDiscount = Math.max(0, parseFloat(amount) || 0)
    try {
      await fetch('/api/pos/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_bill_discount', cartId, billDiscount }),
      })
    } catch { /* silently fail */ }
    setCarts(prev => prev.map((c, i) => (i === activeIndex ? { ...c, bill_discount: billDiscount } : c)))
  }, [cartId, activeIndex])

  const subtotal        = items.reduce((s, i) => s + parseFloat(i.unit_price) * i.quantity, 0)
  const discountTotal   = items.reduce((s, i) => s + parseFloat(i.discount ?? 0) * i.quantity, 0)
  // Clamp the bill discount so the net can't go negative.
  const billDiscount    = Math.min(rawBillDiscount, Math.max(0, subtotal - discountTotal))
  const taxableSubtotal = Math.max(0, subtotal - discountTotal - billDiscount)
  // No bill discount → keep the canonical per-line-then-sum (matches desktop + the stored line
  // gst_5/total exactly). With a bill discount → GST is computed on the discounted invoice net.
  const gstTotal   = billDiscount > 0
    ? parseFloat((taxableSubtotal * 0.05).toFixed(2))
    : parseFloat(items.reduce((s, i) => s + parseFloat(i.gst_5), 0).toFixed(2))
  const grandTotal = billDiscount > 0
    ? parseFloat((taxableSubtotal + gstTotal).toFixed(2))
    : parseFloat(items.reduce((s, i) => s + parseFloat(i.total), 0).toFixed(2))

  return {
    cartId, items, customer, loading,
    subtotal:        parseFloat(subtotal.toFixed(2)),
    discountTotal:   parseFloat(discountTotal.toFixed(2)),
    billDiscount:    parseFloat(billDiscount.toFixed(2)),
    taxableSubtotal: parseFloat(taxableSubtotal.toFixed(2)),
    gstTotal:        parseFloat(gstTotal.toFixed(2)),
    grandTotal:      parseFloat(grandTotal.toFixed(2)),
    carts,
    activeIndex,
    holdCart,
    switchCart,
    cancelCart,
    addItem, updateQty, applyDiscount, overridePrice, repriceCart, removeItem, clearCart, setCustomerIdentity, applyBillDiscount,
  }
}
