"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"

export function useShift() {
  const supabase = createClient()
  const [shift, setShift] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchShift = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLoading(false); return }

    try {
      const res = await fetch('/api/shifts', {
        headers: { authorization: `Bearer ${session.access_token}` },
      })
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
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null

    const res = await fetch('/api/shifts/open', {
      method: 'POST',
      headers: { authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' },
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
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null

    const res = await fetch(`/api/shifts/${shiftId}/close`, {
      method: 'POST',
      headers: { authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' },
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
