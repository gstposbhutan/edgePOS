"use client"

import { useState, useCallback, useEffect } from "react"

// Cash drawer adjustments for the active shift (manager/owner). Mirrors desktop's
// use-cash-adjustments. `list` refreshes whenever an add succeeds.
export function useCashAdjustments(shiftId) {
  const [adjustments, setAdjustments] = useState([])
  const [loading, setLoading] = useState(false)

  const list = useCallback(async () => {
    if (!shiftId) { setAdjustments([]); return }
    setLoading(true)
    try {
      const qs = shiftId ? `?shift_id=${encodeURIComponent(shiftId)}` : ''
      const res = await fetch(`/api/cash-adjustments${qs}`)
      if (res.ok) {
        const data = await res.json()
        setAdjustments(data.adjustments || [])
      }
    } catch {
      /* silently fail */
    }
    setLoading(false)
  }, [shiftId])

  useEffect(() => { list() }, [list])

  const add = useCallback(async ({ type, amount, reason, notes }) => {
    const res = await fetch('/api/cash-adjustments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, amount, reason, notes: notes || undefined }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to record adjustment')
    await list()
    return data.adjustment
  }, [list])

  // Running cash-in / cash-out totals for the loaded entries.
  const totalCashIn  = adjustments.filter(a => a.type === 'CASH_IN').reduce((s, a) => s + parseFloat(a.amount), 0)
  const totalCashOut = adjustments.filter(a => a.type === 'CASH_OUT').reduce((s, a) => s + parseFloat(a.amount), 0)

  return { adjustments, loading, list, add, totalCashIn, totalCashOut }
}
