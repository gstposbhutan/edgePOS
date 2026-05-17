"use client"

import { useState, useEffect, useCallback } from "react"

/**
 * Manages stock prediction data for a store entity via API routes.
 * @param {string} entityId
 */
export function useStockPredictions(entityId) {
  const [predictions, setPredictions] = useState([])
  const [summary, setSummary]         = useState({ critical: 0, at_risk: 0, healthy: 0, insufficient_data: 0, dead_stock: 0, error: 0 })
  const [calculatedAt, setCalculatedAt] = useState(null)
  const [loading, setLoading]           = useState(true)
  const [refreshing, setRefreshing]     = useState(false)

  useEffect(() => {
    if (!entityId) return
    fetchPredictions()
  }, [entityId])

  async function fetchPredictions(statusFilter) {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) {
        const filter = Array.isArray(statusFilter) ? statusFilter.join(',') : statusFilter
        params.set('status', filter)
      }

      const res = await fetch(`/api/predictions/refresh?${params}`)
      const data = await res.json()

      if (res.ok) {
        setPredictions(data.predictions ?? [])
        setCalculatedAt(data.calculated_at ?? null)
        if (data.summary) setSummary(data.summary)
      }
    } catch {
      // leave unchanged
    }
    setLoading(false)
  }

  async function refreshPredictions() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/predictions/refresh', { method: 'POST' })
      const data = await res.json()
      setRefreshing(false)

      if (data.error) return { error: data.error }

      await fetchPredictions()
      return { error: null }
    } catch (err) {
      setRefreshing(false)
      return { error: err.message }
    }
  }

  async function fetchLeadTimes() {
    try {
      const res = await fetch('/api/predictions/lead-times')
      const data = await res.json()
      if (res.ok) return data.leadTimes ?? []
    } catch {
      // fall through
    }
    return []
  }

  async function setLeadTime(productId, supplierId, leadTimeDays, notes) {
    const res = await fetch('/api/predictions/lead-times', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: productId,
        supplier_id: supplierId,
        lead_time_days: leadTimeDays,
        notes: notes || null,
      }),
    })
    const data = await res.json()
    return { error: data.error ?? null }
  }

  return {
    predictions, summary, calculatedAt, loading, refreshing,
    fetchPredictions, refreshPredictions, fetchLeadTimes, setLeadTime,
  }
}
