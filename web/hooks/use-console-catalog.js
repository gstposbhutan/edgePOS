"use client"

import { useState, useEffect, useCallback } from "react"

/**
 * CRUD for a vendor's OWN catalog via the entity-scoped /api/console/catalog routes.
 * Everything returned here is already scoped server-side to the caller's entity
 * (created_by), so this hook never needs the entity id itself.
 */
export function useConsoleCatalog() {
  const [products,   setProducts]   = useState([])
  const [categories, setCategories] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/console/catalog')
      const data = await res.json()
      if (res.ok) {
        setProducts(data.products ?? [])
        if (data.categories) setCategories(data.categories)
      }
    } catch {
      // leave unchanged
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchProducts() }, [fetchProducts])

  const createProduct = useCallback(async (formData, categoryIds) => {
    setSaving(true)
    try {
      const res = await fetch('/api/console/catalog', {
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
  }, [fetchProducts])

  const updateProduct = useCallback(async (productId, formData, categoryIds) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/console/catalog/${productId}`, {
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
  }, [fetchProducts])

  const toggleActive = useCallback(async (productId, isActive) => {
    await fetch(`/api/console/catalog/${productId}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: isActive }),
    })
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, is_active: isActive } : p))
  }, [])

  // -- Packages (Model B) --
  // The package CRUD endpoints are entity-scoped via getAuthContext (created_by), so they work
  // unchanged from the console. Vendor packages are stocked_as_unit = true and carry opening
  // stock, which is what makes them discrete per-level inventory.

  const fetchPackages = useCallback(async () => {
    try {
      const res  = await fetch('/api/products/catalog/_/package')
      const data = await res.json()
      if (res.ok) return data.packages ?? []
    } catch {
      // fall through
    }
    return []
  }, [])

  const createPackage = useCallback(async (formData, componentItems, categoryIds) => {
    setSaving(true)
    try {
      const res = await fetch('/api/products/catalog/_/package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formData: { ...formData, stocked_as_unit: true },
          componentItems, categoryIds,
        }),
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
  }, [fetchProducts])

  const updatePackage = useCallback(async (packageId, productId, formData, componentItems, categoryIds) => {
    setSaving(true)
    try {
      const res = await fetch('/api/products/catalog/_/package', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId, productId,
          formData: { ...formData, stocked_as_unit: true },
          componentItems, categoryIds,
        }),
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
  }, [fetchProducts])

  const deactivatePackage = useCallback(async (packageId, productId) => {
    await fetch('/api/products/catalog/_/package', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packageId, productId }),
    })
    await fetchProducts()
  }, [fetchProducts])

  const openPackage = useCallback(async (packageProductId, qty) => {
    try {
      const res = await fetch('/api/console/packages/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package_product_id: packageProductId, qty }),
      })
      const data = await res.json()
      if (!res.ok) return { error: data.error }
      await fetchProducts()
      return { error: null, stocks: data.stocks ?? [] }
    } catch (err) {
      return { error: err.message }
    }
  }, [fetchProducts])

  return {
    products, categories, loading, saving,
    createProduct, updateProduct, toggleActive,
    fetchPackages, createPackage, updatePackage, deactivatePackage, openPackage,
    refresh: fetchProducts,
  }
}
