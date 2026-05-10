"use client"

import { useState, useCallback } from 'react'

export function useShopOrders() {
  const [orders, setOrders] = useState([])
  const [orderDetail, setOrderDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/shop/orders')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setOrders(data.orders || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchOrderDetail = useCallback(async (id) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/shop/orders/${id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setOrderDetail(data)
      return data
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return { orders, orderDetail, loading, error, fetchOrders, fetchOrderDetail }
}
