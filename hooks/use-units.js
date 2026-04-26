'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Hook for managing units of measurement
 */
export function useUnits(options = {}) {
  const { includeInactive = false } = options
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchUnits = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (includeInactive) params.set('include_inactive', 'true')

      const res = await fetch(`/api/units?${params}`)
      const data = await res.json()

      if (!res.ok) throw new Error(data.error)

      setUnits(data.units || [])
    } catch (err) {
      console.error('[useUnits] Error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [includeInactive])

  return { units, loading, error, fetchUnits }
}
