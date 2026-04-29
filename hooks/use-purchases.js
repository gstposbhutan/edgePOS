"use client"

import { useState, useCallback } from 'react'

export function usePurchases() {
  const [purchases, setPurchases] = useState([])
  const [detail,    setDetail]    = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)

  const fetchPurchases = useCallback(async ({ type, status } = {}) => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams()
      if (type)   params.set('type', type)
      if (status) params.set('status', status)
      const res = await fetch(`/api/purchases?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPurchases(data.orders || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchDetail = useCallback(async (id) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/purchases/${id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDetail(data)
      return data
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const createPO = useCallback(async (formData) => {
    setError(null)
    const res = await fetch('/api/purchases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    return data.order
  }, [])

  const updateStatus = useCallback(async (id, status, reason) => {
    const res = await fetch(`/api/purchases/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, reason }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    return data
  }, [])

  const convertToInvoice = useCallback(async (poId, { items, payment_method, supplier_ref }) => {
    setError(null)
    const res = await fetch(`/api/purchases/${poId}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, payment_method, supplier_ref }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    return data.invoice
  }, [])

  const confirmInvoice = useCallback(async (invoiceId) => {
    setError(null)
    const res = await fetch(`/api/purchases/${invoiceId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    return data
  }, [])

  return {
    purchases, detail, loading, error,
    fetchPurchases, fetchDetail, createPO,
    updateStatus, convertToInvoice, confirmInvoice,
  }
}
