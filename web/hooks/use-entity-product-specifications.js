'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Hook for managing entity product specifications
 */
export function useEntityProductSpecifications(entityProductId = null) {
  const [specifications, setSpecifications] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchSpecifications = useCallback(async (id = entityProductId) => {
    if (!id) {
      setSpecifications([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/entity-products/${id}/specifications`)
      const data = await res.json()

      if (!res.ok) throw new Error(data.error)

      setSpecifications(data.specifications || [])
    } catch (err) {
      console.error('[useEntityProductSpecifications] Error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [entityProductId])

  const saveSpecifications = useCallback(async (id, specsData) => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/admin/entity-products/${id}/specifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${(await createClient().auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({ specifications: specsData }),
      })

      const data = await res.json()

      if (!res.ok) throw new Error(data.error)

      setSpecifications(data.specifications || [])
      return data.specifications
    } catch (err) {
      console.error('[useEntityProductSpecifications] Save error:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    specifications,
    loading,
    error,
    fetchSpecifications,
    saveSpecifications,
  }
}
