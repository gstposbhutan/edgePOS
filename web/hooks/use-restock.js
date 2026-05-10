'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getUser, getRoleClaims, getSession as getAuthSession } from '@/lib/auth'

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

  async function getSession() {
    // Use the auth library's getSession which handles cookies properly
    const sessionData = await getAuthSession()

    if (!sessionData) {
      console.error('[getSession] No session found')
      const supabase = createClient()
      return { supabase, token: null, user: null }
    }

    const { session, error } = sessionData
    if (error || !session) {
      console.error('[getSession] Session error:', error)
      const supabase = createClient()
      return { supabase, token: null, user: null }
    }

    console.log('[getSession] Session found, token:', session.access_token ? 'yes' : 'no')

    // Also get the user for getUser calls
    const supabase = createClient()
    return { supabase, token: session.access_token, user: session.user }
  }

  /** Fetch connected wholesalers for the current retailer */
  const fetchConnections = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const { token } = await getSession()

      const res = await fetch('/api/restock/connections', {
        headers: { authorization: `Bearer ${token}` },
      })

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
      const { token } = await getSession()
      const params = new URLSearchParams({ wholesaler_id: wholesalerId })
      if (search) params.set('search', search)

      const res = await fetch(`/api/wholesale/catalog?${params}`, {
        headers: { authorization: `Bearer ${token}` },
      })

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
      const { token } = await getSession()

      if (!token) {
        console.error('[placeOrder] No token available')
        setError('Authentication failed. Please log in again.')
        return null
      }

      console.log('[placeOrder] Creating order for wholesaler:', wholesalerId, 'items:', items)

      // Add timeout to prevent hanging
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

      const res = await fetch('/api/wholesale/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ wholesaler_id: wholesalerId, items }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const data = await res.json()
      console.log('[placeOrder] Response:', { status: res.status, data })

      if (!res.ok) {
        console.error('[placeOrder] Error:', data.error)
        throw new Error(data.error || 'Failed to place order')
      }

      console.log('[placeOrder] Order created:', data.order)
      return data.order
    } catch (err) {
      console.error('[placeOrder] Exception:', err)
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
      const { token } = await getSession()
      const params = new URLSearchParams()
      if (status) params.set('status', status)

      const res = await fetch(`/api/wholesale/orders?${params}`, {
        headers: { authorization: `Bearer ${token}` },
      })

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
