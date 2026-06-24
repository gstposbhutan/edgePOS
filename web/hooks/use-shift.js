"use client"

import { useState, useEffect, useCallback } from "react"

export function useShift() {
  const [shift, setShift] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchShift = useCallback(async () => {
    try {
      const res = await fetch('/api/shifts')
      if (res.ok) {
        const data = await res.json()
        setShift(data.shift)
      }
    } catch {
      // silently fail
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchShift() }, [fetchShift])

  async function openShift(register_id, opening_float) {
    const res = await fetch('/api/shifts/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ register_id, opening_float }),
    })
    const data = await res.json()
    if (res.ok) {
      await fetchShift()
      return data.shift
    }
    throw new Error(data.error || 'Failed to open shift')
  }

  async function closeShift(shiftId, closing_count) {
    const res = await fetch(`/api/shifts/${shiftId}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ closing_count }),
    })
    const data = await res.json()
    if (res.ok) {
      setShift(null)
      return data
    }
    throw new Error(data.error || 'Failed to close shift')
  }

  // Live drawer reconciliation for an open shift (manager/owner). Returns null for a
  // cashier (403) so the end-shift modal can stay blind.
  async function getReconciliation(shiftId) {
    const res = await fetch(`/api/shifts/${shiftId}/reconciliation`)
    if (res.status === 403) return null
    const data = await res.json()
    if (res.ok) return data
    throw new Error(data.error || 'Failed to load reconciliation')
  }

  // Daily Z-report (end-of-day aggregates) for a given YYYY-MM-DD.
  async function getZReport(date) {
    const res = await fetch(`/api/shifts/z-report?date=${encodeURIComponent(date)}`)
    const data = await res.json()
    if (res.ok) return data.report
    throw new Error(data.error || 'Failed to load Z-report')
  }

  return { shift, loading, fetchShift, openShift, closeShift, getReconciliation, getZReport }
}
