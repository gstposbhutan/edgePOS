"use client"

import { useState, useCallback } from 'react'

export function useRider() {
  const [data,    setData]    = useState({ queue: [], history: [], rider: null })
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

  const reject  = (id)      => orderAction(id, 'reject')
  const pickup  = (id, otp) => orderAction(id, 'pickup',  { otp })
  const deliver = (id, otp) => orderAction(id, 'deliver', { otp })

  // Report GPS silently (best-effort — ignore failures).
  const updateLocation = useCallback(async (lat, lng) => {
    try {
      await fetch('/api/rider/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng }),
      })
    } catch { /* offline / denied — fine */ }
  }, [])

  // Toggle on/off shift. Going online drains any orphaned orders.
  const setShift = useCallback(async (available) => {
    const res = await fetch('/api/rider/shift', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error)
    await fetchOrders()
    return json
  }, [fetchOrders])

  return { ...data, loading, error, fetchOrders, reject, pickup, deliver, updateLocation, setShift }
}
