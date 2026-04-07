"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"

/**
 * Manages inventory data and movements for a store entity.
 * @param {string} entityId
 */
export function useInventory(entityId) {
  const supabase = createClient()

  const [products,  setProducts]  = useState([])
  const [movements, setMovements] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [filter,    setFilter]    = useState('ALL') // ALL | LOW | OUT

  useEffect(() => {
    if (!entityId) return
    fetchProducts()
  }, [entityId])

  async function fetchProducts() {
    setLoading(true)
    const { data } = await supabase
      .from('products')
      .select('id, name, sku, unit, current_stock, mrp, wholesale_price, hsn_code, is_active, reorder_point, barcode')
      .eq('is_active', true)
      .order('name')

    setProducts(data ?? [])
    setLoading(false)
  }

  async function fetchMovements(productId = null) {
    let query = supabase
      .from('inventory_movements')
      .select('id, movement_type, quantity, notes, created_at, products(name, sku)')
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (productId) query = query.eq('product_id', productId)

    const { data } = await query
    setMovements(data ?? [])
  }

  /**
   * Record a manual stock adjustment.
   * @param {string} productId
   * @param {'RESTOCK'|'LOSS'|'DAMAGED'|'TRANSFER'} type
   * @param {number} quantity - positive or negative
   * @param {string} notes
   */
  const adjustStock = useCallback(async (productId, type, quantity, notes) => {
    const { error } = await supabase
      .from('inventory_movements')
      .insert({
        product_id:    productId,
        entity_id:     entityId,
        movement_type: type,
        quantity,         // DB trigger auto-updates products.current_stock
        notes,
      })

    if (!error) await fetchProducts()
    return { error: error?.message ?? null }
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

  return {
    products: filtered,
    allProducts: products,
    movements,
    loading,
    filter,
    setFilter,
    lowCount,
    outCount,
    adjustStock,
    fetchMovements,
    refresh: fetchProducts,
  }
}
