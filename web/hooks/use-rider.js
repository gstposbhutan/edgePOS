"use client"

import { useState, useCallback } from 'react'

export function useRider() {
  const [data,    setData]    = useState({ current: null, history: [], rider: null })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/rider/orders')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setData(json)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  async function orderAction(orderId, action, body = {}) {
    const res = await fetch(`/api/rider/orders/${orderId}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error)
    await fetchOrders()
    return json
  }

  const accept  = (id)      => orderAction(id, 'accept')
  const reject  = (id)      => orderAction(id, 'reject')
  const pickup  = (id, otp) => orderAction(id, 'pickup',  { otp })
  const deliver = (id, otp) => orderAction(id, 'deliver', { otp })

  return { ...data, loading, error, fetchOrders, accept, reject, pickup, deliver }
}
