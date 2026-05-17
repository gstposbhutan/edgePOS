'use client'

import { useState, useCallback } from 'react'

/**
 * Hook for retailer restock operations.
 * Manages: connections, catalog browsing, order placement, order history.
 */
export function useRestock() {
  const [connections, setConnections] = useState([])
  const [catalog, setCatalog] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  /** Fetch connected wholesalers for the current retailer */
  const fetchConnections = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/restock/connections')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setConnections(data.connections || [])
    } catch (err) {
      console.error('[fetchConnections] Error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  /** Fetch products for a specific wholesaler */
  const fetchCatalog = useCallback(async (wholesalerId, search = '') => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({ wholesaler_id: wholesalerId })
      if (search) params.set('search', search)

      const res = await fetch(`/api/wholesale/catalog?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setCatalog(data.products || [])
    } catch (err) {
      setError(err.message)
      setCatalog([])
    } finally {
      setLoading(false)
    }
  }, [])

  /** Place a purchase order */
  const placeOrder = useCallback(async (wholesalerId, items) => {
    setLoading(true)
    setError(null)

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      const res = await fetch('/api/wholesale/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wholesaler_id: wholesalerId, items }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Failed to place order')

      return data.order
    } catch (err) {
      setError(err.message || 'Failed to place order')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  /** Fetch wholesale order history */
  const fetchOrders = useCallback(async (status = null) => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (status) params.set('status', status)

      const res = await fetch(`/api/wholesale/orders?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setOrders(data.orders || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    connections, catalog, orders, loading, error,
    fetchConnections, fetchCatalog, placeOrder, fetchOrders,
  }
}
