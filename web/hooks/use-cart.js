"use client"

import { useState, useEffect, useCallback } from "react"
import { calcCartTotals } from "@/lib/gst"

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
  // The till's Alt+T basis belongs to the TICKET (migration 138), not to this tab: the server
  // writes every line's gst_5 and total from it, so the slip's lines and its total can never
  // disagree about which way the tax ran.
  const gstIncluded = !!activeCart?.gst_included

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

  const addItem = useCallback(async (product, modeOverride, weight) => {
    if (!cartId) return

    // Per-line rate: the product-search rate toggle passes a tier for THIS line; fall back to the
    // invoice default when unspecified. The server stores this tier price as the line unit_price.
    const unitPrice = priceFor(product, modeOverride || priceListMode)
    const batchId   = product.batch_id ?? null

    // Weighed goods: `weight` is the measured quantity (in product.unit); each weighing is its own
    // line (no merge), and the line quantity is that fractional weight.
    const isWeighed = weight != null && weight > 0

    if (!isWeighed) {
      // Dedup: merge only when product + batch + salesperson + RATE all match. Rate is part of the
      // key so the same SKU added at two tiers (e.g. one wholesale line + one retail line) stays as
      // two separate lines; salesperson likewise keeps per-staff lines distinct.
      const existing = items.find(i =>
        i.product_id === product.id &&
        !i.package_id &&
        (i.batch_id ?? null) === (batchId ?? null) &&
        (i.salesperson_id ?? null) === (product.salesperson_id ?? null) &&
        Number(i.unit_price) === Number(unitPrice)
      )
      // Returns the merged line, so callers that need the row (Ctrl+Z's restore) get one either
      // way rather than having to guess which branch ran.
      if (existing) {
        const merged = await updateQty(existing.id, existing.quantity + 1)
        return merged?.item ?? null
      }
    }

    try {
      const res = await fetch('/api/pos/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', cartId, product: { ...product, unitPrice, quantity: isWeighed ? weight : (product.quantity ?? 1) } }),
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
          return data.item
        }
      }
    } catch { /* silently fail */ }
    return null
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
          // Report the cap so callers can auto-split the overflow across other batches (FEFO/FIFO).
          return { item: data.item, capped: !!data.stockCapped, available: data.available }
        }
      }
    } catch { /* silently fail */ }
    return null
  }, [items, activeIndex, onStockCap])

  // Explicit batch override: switch a line to a specific batch (re-prices to that batch's price
  // server-side, caps qty to it). Returns { capped, available } like updateQty.
  const changeBatch = useCallback(async (itemId, batchId) => {
    const item = items.find(i => i.id === itemId)
    try {
      const res = await fetch('/api/pos/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'change_batch', itemId, batchId }),
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
          return { item: data.item, capped: !!data.stockCapped, available: data.available }
        }
      }
    } catch { /* silently fail */ }
    return null
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

  // Assign (or clear) the salesperson for a single cart line — per-line attribution (#3).
  const setLineSalesperson = useCallback(async (itemId, salespersonId) => {
    try {
      const res = await fetch('/api/pos/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_salesperson', itemId, salespersonId: salespersonId ?? null }),
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

  // Alt+U — ring a line in a different unit (Pcs / Pack / Case). The server re-rates from the
  // price per PIECE and re-checks the stock cap in the new unit, so a case can never be sold
  // out of a shelf holding half of one.
  const setLineUnit = useCallback(async (itemId, { label, factor }) => {
    try {
      const res = await fetch('/api/pos/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_unit', itemId, unitLabel: label, unitFactor: factor }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return { error: data.error || 'Could not change the unit' }
      if (data.item) {
        setCarts(prev => prev.map((c, i) =>
          i === activeIndex
            ? { ...c, cart_items: c.cart_items.map(ci => ci.id === itemId ? data.item : ci) }
            : c
        ))
        if (data.stockCapped) onStockCap?.(data.item.name, data.available)
      }
      return { item: data.item, capped: !!data.stockCapped, available: data.available }
    } catch {
      return { error: 'Could not change the unit' }
    }
  }, [activeIndex, onStockCap])

  // Ctrl+T — the cashier's note on one line. Empty clears it.
  const setLineRemark = useCallback(async (itemId, remark) => {
    try {
      const res = await fetch('/api/pos/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_remark', itemId, remark }),
      })
      if (!res.ok) return
      const data = await res.json()
      if (data.item) {
        setCarts(prev => prev.map((c, i) =>
          i === activeIndex
            ? { ...c, cart_items: c.cart_items.map(ci => ci.id === itemId ? data.item : ci) }
            : c
        ))
      }
    } catch { /* silently fail */ }
  }, [activeIndex])

  // Alt+T — set the basis for this ticket. The server refuses once the cart has lines (one
  // ticket, one basis), and returns the reason so the till can say it.
  const setGstIncluded = useCallback(async (flag) => {
    // The cart loads asynchronously; a key pressed in that window is early, not wrong.
    if (!cartId) return { error: 'Ticket still loading — try again' }
    try {
      const res = await fetch('/api/pos/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_gst_included', cartId, gstIncluded: !!flag }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return { error: data.error || 'Could not change the GST basis' }
      setCarts(prev => prev.map((c, i) => (i === activeIndex ? { ...c, gst_included: !!flag } : c)))
      return { gstIncluded: !!flag }
    } catch {
      return { error: 'Could not change the GST basis' }
    }
  }, [cartId, activeIndex])

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

  // Totals come from the shared helper (web/lib/gst.js), which is the mirror of the terminal's
  // desktop/lib/gst.ts — a ticket must print the same bill whichever till rang it. Exemption is
  // honoured in BOTH branches, including under a bill discount, where it used to be ignored.
  const totals = calcCartTotals(
    items.map(i => ({
      unitPrice: parseFloat(i.unit_price) || 0,
      discount:  parseFloat(i.discount ?? 0) || 0,
      quantity:  i.quantity,
      // The server owns the tax decision; the line simply carries it here for display.
      gstExempt: !!(i.product?.gst_exempt ?? (parseFloat(i.gst_5 ?? 0) === 0 && parseFloat(i.total ?? 0) > 0)),
    })),
    rawBillDiscount,
    gstIncluded,
  )
  const { subtotal, discountTotal, billDiscount, taxableSubtotal, gstTotal, grandTotal } = totals

  return {
    cartId, items, customer, loading, gstIncluded,
    subtotal, discountTotal, billDiscount, taxableSubtotal, gstTotal, grandTotal,
    carts,
    activeIndex,
    holdCart,
    switchCart,
    cancelCart,
    addItem, updateQty, changeBatch, applyDiscount, overridePrice, repriceCart, removeItem, clearCart, setCustomerIdentity, applyBillDiscount, setLineSalesperson, setLineUnit, setLineRemark, setGstIncluded,
  }
}
