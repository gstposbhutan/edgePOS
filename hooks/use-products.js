"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"

/**
 * Fetches sellable products from the `sellable_products` view.
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
  const supabase = createClient()

  const [products, setProducts] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [query,    setQuery]    = useState('')

  useEffect(() => {
    fetchProducts()
  }, [entityId])

  async function fetchProducts() {
    setLoading(true)
    const { data } = await supabase
      .from('sellable_products')
      .select('id, name, sku, hsn_code, image_url, available_stock, wholesale_price, mrp, selling_price, unit, product_type, package_type, package_def_id, package_barcode, reorder_point, batch_id, batch_number, expires_at, batch_barcode')
      .order('name')
      .limit(100)

    setProducts(data ?? [])
    setLoading(false)
  }

  const search = useCallback(async (searchQuery) => {
    setQuery(searchQuery)
    if (!searchQuery.trim()) return fetchProducts()

    setLoading(true)
    const { data } = await supabase
      .from('sellable_products')
      .select('id, name, sku, hsn_code, image_url, available_stock, wholesale_price, mrp, selling_price, unit, product_type, package_type, package_def_id, package_barcode, reorder_point, batch_id, batch_number, expires_at, batch_barcode')
      .or(`name.ilike.%${searchQuery}%,sku.ilike.%${searchQuery}%`)
      .order('name')
      .limit(50)

    setProducts(data ?? [])
    setLoading(false)
  }, [])

  return { products, loading, query, search, refresh: fetchProducts }
}
