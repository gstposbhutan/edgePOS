"use client"

import { useState, useEffect, useCallback } from "react"

/**
 * CRUD operations for the product catalogue via API routes.
 * @param {string} entityId - Store entity UUID (used as created_by)
 */
export function useProductCatalog(entityId) {
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
    try {
      const res = await fetch('/api/products/catalog')
      const data = await res.json()
      if (res.ok) {
        setProducts(data.products ?? [])
        if (data.categories) setCategories(data.categories)
      }
    } catch {
      // leave unchanged
    }
    setLoading(false)
  }

  async function fetchCategories() {
    try {
      const res = await fetch('/api/products/catalog')
      const data = await res.json()
      if (res.ok && data.categories) setCategories(data.categories)
    } catch {
      // leave unchanged
    }
  }

  /**
   * Create a new product and assign categories.
   * @param {object} formData
   * @param {string[]} categoryIds
   * @returns {Promise<{ error: string|null }>}
   */
  const createProduct = useCallback(async (formData, categoryIds) => {
    setSaving(true)
    try {
      const res = await fetch('/api/products/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formData, categoryIds }),
      })
      const data = await res.json()
      if (!res.ok) { setSaving(false); return { error: data.error } }

      await fetchProducts()
      setSaving(false)
      return { error: null }
    } catch (err) {
      setSaving(false)
      return { error: err.message }
    }
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
    try {
      const res = await fetch(`/api/products/catalog/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formData, categoryIds }),
      })
      const data = await res.json()
      if (!res.ok) { setSaving(false); return { error: data.error } }

      await fetchProducts()
      setSaving(false)
      return { error: null }
    } catch (err) {
      setSaving(false)
      return { error: err.message }
    }
  }, [])

  /**
   * Toggle product active/inactive.
   * @param {string} productId
   * @param {boolean} isActive
   */
  const toggleActive = useCallback(async (productId, isActive) => {
    await fetch(`/api/products/catalog/${productId}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field: 'is_active', value: isActive }),
    })
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, is_active: isActive } : p))
  }, [])

  /**
   * Toggle sold_as_package_only flag.
   */
  const togglePackageOnly = useCallback(async (productId, value) => {
    await fetch(`/api/products/catalog/${productId}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field: 'sold_as_package_only', value }),
    })
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, sold_as_package_only: value } : p))
  }, [])

  /**
   * Toggle product visibility on marketplace page.
   * @param {string} productId
   * @param {boolean} visible
   */
  const toggleVisibleOnWeb = useCallback(async (productId, visible) => {
    await fetch(`/api/products/catalog/${productId}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field: 'visible_on_web', value: visible }),
    })
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, visible_on_web: visible } : p))
  }, [])

  // -- Package CRUD --

  /**
   * Fetch all packages created by this entity with their component items.
   */
  async function fetchPackages() {
    try {
      const res = await fetch('/api/products/catalog/_/package')
      const data = await res.json()
      if (res.ok) return data.packages ?? []
    } catch {
      // fall through
    }
    return []
  }

  /**
   * Create a new package.
   * @param {object} formData  { name, package_type, mrp, wholesale_price, hsn_code, barcode, qr_code, image_url }
   * @param {{ product_id: string, quantity: number }[]} componentItems
   * @param {string[]} categoryIds
   */
  const createPackage = useCallback(async (formData, componentItems, categoryIds) => {
    setSaving(true)
    try {
      const res = await fetch('/api/products/catalog/_/package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formData, componentItems, categoryIds }),
      })
      const data = await res.json()
      if (!res.ok) { setSaving(false); return { error: data.error } }

      await fetchProducts()
      setSaving(false)
      return { error: null, packageId: data.packageId }
    } catch (err) {
      setSaving(false)
      return { error: err.message }
    }
  }, [entityId])

  /**
   * Update an existing package definition and its components.
   */
  const updatePackage = useCallback(async (packageId, productId, formData, componentItems, categoryIds) => {
    setSaving(true)
    try {
      const res = await fetch('/api/products/catalog/_/package', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId, productId, formData, componentItems, categoryIds }),
      })
      const data = await res.json()
      if (!res.ok) { setSaving(false); return { error: data.error } }

      await fetchProducts()
      setSaving(false)
      return { error: null }
    } catch (err) {
      setSaving(false)
      return { error: err.message }
    }
  }, [])

  /**
   * Deactivate a package.
   */
  const deactivatePackage = useCallback(async (packageId, productId) => {
    await fetch('/api/products/catalog/_/package', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packageId, productId }),
    })
    await fetchProducts()
  }, [])

  return {
    products, categories, loading, saving,
    createProduct, updateProduct, toggleActive, togglePackageOnly, toggleVisibleOnWeb,
    createPackage, updatePackage, deactivatePackage, fetchPackages,
    refresh: fetchProducts,
  }
}
