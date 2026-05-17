"use client"

import { useState, useEffect, useCallback } from 'react'

/**
 * Fetches all stores an OWNER user manages.
 * Returns the list and helpers to switch the active store and create new ones.
 */
export function useOwnerStores(userId, subRole) {
  const [stores,      setStores]      = useState([])
  const [loading,     setLoading]     = useState(false)

  const fetchStores = useCallback(async () => {
    if (!userId || subRole !== 'OWNER') return
    setLoading(true)

    try {
      const res = await fetch('/api/admin/stores')
      const data = await res.json()

      if (!res.ok) {
        console.error('[useOwnerStores] Error:', data.error)
        setStores([])
      } else {
        setStores(data.stores || [])
      }
    } catch (err) {
      console.error('[useOwnerStores] Error:', err)
      setStores([])
    } finally {
      setLoading(false)
    }
  }, [userId, subRole])

  useEffect(() => { fetchStores() }, [fetchStores])

  const createStore = useCallback(async ({ name, tpn_gstin, whatsapp_no }) => {
    try {
      const res = await fetch('/api/admin/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, tpn_gstin, whatsapp_no }),
      })
      const data = await res.json()

      if (!res.ok) return { error: data.error }

      await fetchStores()
      return { entity: data.store }
    } catch (err) {
      return { error: err.message }
    }
  }, [fetchStores])

  return { stores, loading, fetchStores, createStore }
}
