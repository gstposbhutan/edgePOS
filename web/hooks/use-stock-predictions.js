"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"

/**
 * Manages stock prediction data for a store entity.
 * @param {string} entityId
 */
export function useStockPredictions(entityId) {
  const supabase = createClient()

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

    // Get latest calculated_at for this entity
    const { data: latest } = await supabase
      .from('stock_predictions')
      .select('calculated_at')
      .eq('entity_id', entityId)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single()

    if (!latest) {
      setPredictions([])
      setLoading(false)
      return
    }

    setCalculatedAt(latest.calculated_at)

    // Fetch predictions for that batch
    let query = supabase
      .from('stock_predictions')
      .select(`*, products(name, sku, current_stock, reorder_point)`)
      .eq('entity_id', entityId)
      .eq('calculated_at', latest.calculated_at)
      .order('days_until_stockout', { ascending: true, nullsFirst: false })

    if (statusFilter) {
      query = query.in('status', Array.isArray(statusFilter) ? statusFilter : [statusFilter])
    }

    const { data } = await query
    setPredictions(data ?? [])
    computeSummary(data ?? [])
    setLoading(false)
  }

  function computeSummary(preds) {
    const s = { critical: 0, at_risk: 0, healthy: 0, insufficient_data: 0, dead_stock: 0, error: 0 }
    for (const p of preds) {
      const key = p.status.toLowerCase()
      if (key in s) s[key]++
    }
    setSummary(s)
  }

  async function refreshPredictions() {
    setRefreshing(true)
    const res = await fetch('/api/predictions', { method: 'POST' })
    const data = await res.json()
    setRefreshing(false)

    if (data.error) return { error: data.error }

    await fetchPredictions()
    return { error: null }
  }

  async function fetchLeadTimes() {
    const { data } = await supabase
      .from('supplier_lead_times')
      .select('*, products(name)')
      .eq('entity_id', entityId)

    return data ?? []
  }

  async function setLeadTime(productId, supplierId, leadTimeDays, notes) {
    const { error } = await supabase
      .from('supplier_lead_times')
      .upsert({
        product_id: productId,
        supplier_id: supplierId,
        entity_id: entityId,
        lead_time_days: leadTimeDays,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'product_id,supplier_id' })

    return { error: error?.message ?? null }
  }

  return {
    predictions, summary, calculatedAt, loading, refreshing,
    fetchPredictions, refreshPredictions, fetchLeadTimes, setLeadTime,
  }
}
