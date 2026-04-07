"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"

/**
 * CRUD operations for the product catalogue.
 * @param {string} entityId - Store entity UUID (used as created_by)
 */
export function useProductCatalog(entityId) {
  const supabase = createClient()

  const [products,   setProducts]   = useState([])
  const [categories, setCategories] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)

  useEffect(() => {
    if (!entityId) return
    Promise.all([fetchProducts(), fetchCategories()])
  }, [entityId])

  async function fetchProducts() {
    setLoading(true)
    const { data } = await supabase
      .from('products')
      .select(`
        id, name, sku, hsn_code, unit, mrp, wholesale_price,
        current_stock, image_url, is_active, created_at,
        product_categories(category_id, categories(id, name))
      `)
      .order('name')

    setProducts(data ?? [])
    setLoading(false)
  }

  async function fetchCategories() {
    const { data } = await supabase
      .from('categories')
      .select('id, name')
      .order('name')
    setCategories(data ?? [])
  }

  /**
   * Create a new product and assign categories.
   * @param {object} formData
   * @param {string[]} categoryIds
   * @returns {Promise<{ error: string|null }>}
   */
  const createProduct = useCallback(async (formData, categoryIds) => {
    setSaving(true)
    const { data: product, error } = await supabase
      .from('products')
      .insert({
        name:            formData.name.trim(),
        sku:             formData.sku?.trim() || null,
        hsn_code:        formData.hsn_code.trim(),
        unit:            formData.unit || 'pcs',
        mrp:             parseFloat(formData.mrp) || 0,
        wholesale_price: parseFloat(formData.wholesale_price) || 0,
        current_stock:   parseInt(formData.current_stock) || 0,
        image_url:       formData.image_url?.trim() || null,
        barcode:         formData.barcode?.trim() || null,
        qr_code:         formData.qr_code?.trim() || null,
        reorder_point:   parseInt(formData.reorder_point) || 10,
        is_active:       true,
        created_by:      entityId,
      })
      .select('id')
      .single()

    if (error) { setSaving(false); return { error: error.message } }

    // Assign categories
    if (categoryIds.length > 0) {
      await supabase.from('product_categories').insert(
        categoryIds.map(cid => ({ product_id: product.id, category_id: cid }))
      )
    }

    // If initial stock > 0, create opening batch + RESTOCK movement
    const openingStock = parseInt(formData.current_stock) || 0
    if (openingStock > 0) {
      const batchNo = formData.batch_number?.trim() || `OPEN-${Date.now()}`
      const { data: batch } = await supabase
        .from('product_batches')
        .insert({
          product_id:     product.id,
          entity_id:      entityId,
          batch_number:   batchNo,
          manufactured_at: formData.manufactured_at || null,
          expires_at:     formData.expires_at || null,
          quantity:       openingStock,
          status:         'ACTIVE',
          notes:          'Opening stock',
        })
        .select('id')
        .single()

      await supabase.from('inventory_movements').insert({
        product_id:    product.id,
        entity_id:     entityId,
        movement_type: 'RESTOCK',
        quantity:      openingStock,
        batch_id:      batch?.id ?? null,
        notes:         `Opening stock — Batch ${batchNo}`,
      })
    }

    await fetchProducts()
    setSaving(false)
    return { error: null }
  }, [entityId])

  /**
   * Update an existing product.
   * @param {string} productId
   * @param {object} formData
   * @param {string[]} categoryIds
   * @returns {Promise<{ error: string|null }>}
   */
  const updateProduct = useCallback(async (productId, formData, categoryIds) => {
    setSaving(true)
    const { error } = await supabase
      .from('products')
      .update({
        name:            formData.name.trim(),
        sku:             formData.sku?.trim() || null,
        hsn_code:        formData.hsn_code.trim(),
        unit:            formData.unit || 'pcs',
        mrp:             parseFloat(formData.mrp) || 0,
        wholesale_price: parseFloat(formData.wholesale_price) || 0,
        image_url:       formData.image_url?.trim() || null,
        barcode:         formData.barcode?.trim() || null,
        qr_code:         formData.qr_code?.trim() || null,
        reorder_point:   parseInt(formData.reorder_point) || 10,
      })
      .eq('id', productId)

    if (error) { setSaving(false); return { error: error.message } }

    // Replace category assignments
    await supabase.from('product_categories').delete().eq('product_id', productId)
    if (categoryIds.length > 0) {
      await supabase.from('product_categories').insert(
        categoryIds.map(cid => ({ product_id: productId, category_id: cid }))
      )
    }

    await fetchProducts()
    setSaving(false)
    return { error: null }
  }, [])

  /**
   * Toggle product active/inactive.
   * @param {string} productId
   * @param {boolean} isActive
   */
  const toggleActive = useCallback(async (productId, isActive) => {
    await supabase.from('products').update({ is_active: isActive }).eq('id', productId)
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, is_active: isActive } : p))
  }, [])

  return {
    products, categories, loading, saving,
    createProduct, updateProduct, toggleActive,
    refresh: fetchProducts,
  }
}
