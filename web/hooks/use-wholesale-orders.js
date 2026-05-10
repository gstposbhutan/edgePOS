'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Hook for wholesaler order management.
 * Manages: incoming purchase orders, status transitions, order details.
 */
export function useWholesaleOrders() {
  const [orders, setOrders] = useState([])
  const [orderDetail, setOrderDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function getToken() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token
  }

  /** Fetch incoming wholesale orders */
  const fetchOrders = useCallback(async (status = null) => {
    setLoading(true)
    setError(null)

    try {
      const token = await getToken()
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

  /** Fetch order detail */
  const fetchOrderDetail = useCallback(async (orderId) => {
    setLoading(true)
    setError(null)
    setOrderDetail(null)

    try {
      const token = await getToken()
      const res = await fetch(`/api/wholesale/orders/${orderId}`, {
        headers: { authorization: `Bearer ${token}` },
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setOrderDetail(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  /** Update order status */
  const updateStatus = useCallback(async (orderId, newStatus, reason = null) => {
    setError(null)

    try {
      const token = await getToken()
      const res = await fetch(`/api/wholesale/orders/${orderId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus, reason }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      // Update local state
      setOrders(prev => prev.map(o =>
        o.id === orderId ? { ...o, status: newStatus } : o
      ))

      if (orderDetail?.order?.id === orderId) {
        setOrderDetail(prev => ({
          ...prev,
          order: { ...prev.order, status: newStatus },
        }))
      }

      return true
    } catch (err) {
      setError(err.message)
      return false
    }
  }, [orderDetail])

  return {
    orders, orderDetail, loading, error,
    fetchOrders, fetchOrderDetail, updateStatus,
  }
}
