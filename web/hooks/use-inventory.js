"use client"

import { useState, useEffect, useCallback } from "react"

/**
 * Manages inventory data and movements for a store entity via API routes.
 * @param {string} entityId
 */
export function useInventory(entityId) {
  const [products,  setProducts]  = useState([])
  const [movements, setMovements] = useState([])
  const [batches,   setBatches]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [filter,    setFilter]    = useState('ALL') // ALL | LOW | OUT

  useEffect(() => {
    if (!entityId) return
    fetchProducts()
  }, [entityId])

  /**
   * Fetch products, optionally with a server-side search filter. The API
   * caps results at PostgREST's max-rows default, so for stores with >1000
   * products we MUST push search to the server — without `q`, products
   * past row 1000 (alphabetical) never appear in the table.
   */
  async function fetchProducts(q) {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q?.trim()) params.set('search', q.trim())
      const url = `/api/inventory${params.toString() ? `?${params}` : ''}`
      const res = await fetch(url)
      const data = await res.json()
      if (res.ok) setProducts(data.products ?? [])
    } catch {
      // leave unchanged
    }
    setLoading(false)
  }

  async function fetchMovements(productId = null) {
    try {
      const params = new URLSearchParams()
      if (productId) params.set('product_id', productId)

      const res = await fetch(`/api/inventory/movements?${params}`)
      const data = await res.json()
      if (res.ok) setMovements(data.movements ?? [])
    } catch {
      // leave unchanged
    }
  }

  /**
   * Record a manual stock adjustment.
   * @param {string} productId
   * @param {'RESTOCK'|'LOSS'|'DAMAGED'|'TRANSFER'} type
   * @param {number} quantity - positive or negative
   * @param {string} notes
   */
  const adjustStock = useCallback(async (productId, type, quantity, notes) => {
    const res = await fetch('/api/inventory/movements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: productId,
        movement_type: type,
        quantity,
        notes,
      }),
    })
    const data = await res.json()

    if (!res.ok) return { error: data.error }

    await fetchProducts()
    return { error: null }
  }, [entityId])

  // Derived filtered list
  const filtered = products.filter(p => {
    const threshold = p.reorder_point ?? 10
    if (filter === 'LOW')  return p.current_stock > 0 && p.current_stock <= threshold
    if (filter === 'OUT')  return p.current_stock <= 0
    return true
  })

  const lowCount = products.filter(p => p.current_stock > 0 && p.current_stock <= (p.reorder_point ?? 10)).length
  const outCount = products.filter(p => p.current_stock <= 0).length

  // -- Fetch active batches for this entity --
  const fetchBatches = useCallback(async (productId = null) => {
    try {
      const params = new URLSearchParams()
      if (productId) params.set('product_id', productId)

      const res = await fetch(`/api/inventory/batches?${params}`)
      const data = await res.json()
      if (res.ok) setBatches(data.batches ?? [])
    } catch {
      // leave unchanged
    }
  }, [entityId])

  // -- Receive stock — creates batch + RESTOCK movement + updates product prices
  const receiveStock = useCallback(async (formData) => {
    const res = await fetch('/api/inventory/receive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    })
    const data = await res.json()
    if (data.error) return { error: data.error, batch: null }
    await fetchProducts()
    await fetchBatches()
    return { error: null, batch: data.batch }
  }, [entityId])

  // Products that are bottlenecking an active package
  async function getPackageBottlenecks() {
    try {
      const res = await fetch('/api/inventory/bottlenecks')
      const data = await res.json()
      if (res.ok) return data.bottlenecks ?? []
    } catch {
      // fall through
    }
    return []
  }

  return {
    products: filtered,
    allProducts: products,
    movements,
    batches,
    loading,
    filter,
    setFilter,
    lowCount,
    outCount,
    adjustStock,
    fetchMovements,
    fetchBatches,
    receiveStock,
    getPackageBottlenecks,
    refresh: fetchProducts,
    fetchProducts,
  }
}
