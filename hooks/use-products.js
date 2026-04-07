"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"

/**
 * Fetches and searches products from Supabase.
 * @param {string} entityId - Scopes to products available to this store
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
      .from('products')
      .select('id, name, sku, hsn_code, image_url, current_stock, wholesale_price, mrp, unit, is_active')
      .eq('is_active', true)
      .order('name')
      .limit(100)

    setProducts(data ?? [])
    setLoading(false)
  }

  const search = useCallback(async (searchQuery) => {
    setQuery(searchQuery)
    if (!searchQuery.trim()) {
      return fetchProducts()
    }

    setLoading(true)
    const { data } = await supabase
      .from('products')
      .select('id, name, sku, hsn_code, image_url, current_stock, wholesale_price, mrp, unit, is_active')
      .eq('is_active', true)
      .or(`name.ilike.%${searchQuery}%,sku.ilike.%${searchQuery}%`)
      .order('name')
      .limit(50)

    setProducts(data ?? [])
    setLoading(false)
  }, [])

  return { products, loading, query, search, refresh: fetchProducts }
}
