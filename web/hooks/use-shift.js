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

  return { shift, loading, fetchShift, openShift, closeShift }
}
