"use client"

import { useState, useEffect, useCallback } from "react"

/**
 * Fetches sellable products from the `sellable_products` view via API.
 *
 * The view automatically:
 *   - Excludes products marked sold_as_package_only = TRUE
 *   - Returns computed available_stock for PACKAGE type products
 *     (recursive availability across all nesting levels including PALLETs)
 *   - Includes package_type (BULK / BUNDLE / MIXED / PALLET) and package_def_id
 *
 * Used by: POS product grid, Marketplace listing.
 * NOT used by: Inventory management (which queries products directly).
 *
 * @param {string} entityId - Store entity UUID
 */
export function useProducts(entityId) {
  const [products, setProducts] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [query,    setQuery]    = useState('')

  useEffect(() => {
    fetchProducts()
  }, [entityId])

  async function fetchProducts() {
    setLoading(true)
    try {
      const res = await fetch('/api/products/sellable')
      const data = await res.json()
      setProducts(data.products ?? [])
    } catch {
      setProducts([])
    }
    setLoading(false)
  }

  const search = useCallback(async (searchQuery) => {
    setQuery(searchQuery)
    if (!searchQuery.trim()) return fetchProducts()

    setLoading(true)
    try {
      const res = await fetch(`/api/products/sellable?q=${encodeURIComponent(searchQuery)}`)
      const data = await res.json()
      setProducts(data.products ?? [])
    } catch {
      setProducts([])
    }
    setLoading(false)
  }, [])

  return { products, loading, query, search, refresh: fetchProducts }
}
