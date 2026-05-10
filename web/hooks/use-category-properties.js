'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Hook for managing category properties
 * @param {string|null} categoryId - Legacy category ID (for backward compatibility)
 * @param {string|null} hsnCode - HSN code for HSN-based property lookup
 */
export function useCategoryProperties(categoryId = null, hsnCode = null) {
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchProperties = useCallback(async (id = categoryId, code = hsnCode) => {
    setLoading(true)
    setError(null)

    try {
      // Build URL with HSN code or category_id parameter
      const params = new URLSearchParams()
      if (code) {
        params.set('hsn_code', code)
      } else if (id) {
        params.set('category_id', id)
      }

      const url = `/api/admin/category-properties${params.toString() ? '?' + params.toString() : ''}`

      const res = await fetch(url, {
        headers: {
          authorization: `Bearer ${(await createClient().auth.getSession()).data.session?.access_token}`,
        },
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error)

      setProperties(data.properties || [])
    } catch (err) {
      console.error('[useCategoryProperties] Error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [categoryId, hsnCode])

  const createProperty = useCallback(async (propertyData) => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/category-properties', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${(await createClient().auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify(propertyData),
      })

      const data = await res.json()

      if (!res.ok) throw new Error(data.error)

      await fetchProperties() // Refresh the list
      return data.property
    } catch (err) {
      console.error('[useCategoryProperties] Create error:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [fetchProperties])

  const updateProperty = useCallback(async (id, updates) => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/admin/category-properties/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${(await createClient().auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify(updates),
      })

      const data = await res.json()

      if (!res.ok) throw new Error(data.error)

      await fetchProperties() // Refresh the list
      return data.property
    } catch (err) {
      console.error('[useCategoryProperties] Update error:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [fetchProperties])

  const deleteProperty = useCallback(async (id) => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/admin/category-properties/${id}`, {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${(await createClient().auth.getSession()).data.session?.access_token}`,
        },
      })

      const data = await res.json()

      if (!res.ok) throw new Error(data.error)

      await fetchProperties() // Refresh the list
      return true
    } catch (err) {
      console.error('[useCategoryProperties] Delete error:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [fetchProperties])

  return {
    properties,
    loading,
    error,
    fetchProperties,
    createProperty,
    updateProperty,
    deleteProperty,
  }
}
