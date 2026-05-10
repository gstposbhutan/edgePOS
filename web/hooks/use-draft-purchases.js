"use client"

import { useState, useCallback } from "react"

/**
 * Manages draft purchases (Photo-to-Stock).
 * @param {string} entityId
 */
export function useDraftPurchases(entityId) {
  const [drafts, setDrafts] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchDrafts = useCallback(async (status) => {
    if (!entityId) return
    setLoading(true)

    let url = `/api/draft-purchases?entity_id=${entityId}`
    if (status) url += `&status=${status}`

    const res = await fetch(url)
    const data = await res.json()
    setDrafts(data.drafts ?? [])
    setLoading(false)
  }, [entityId])

  const fetchDraft = useCallback(async (draftId) => {
    const res = await fetch(`/api/draft-purchases/${draftId}`)
    const data = await res.json()
    return data.draft ?? null
  }, [])

  const updateDraft = useCallback(async (draftId, updates) => {
    const res = await fetch(`/api/draft-purchases/${draftId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    const data = await res.json()
    return data.draft ?? null
  }, [])

  const confirmDraft = useCallback(async (draftId) => {
    const res = await fetch(`/api/draft-purchases/${draftId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'confirm' }),
    })
    return await res.json()
  }, [])

  const cancelDraft = useCallback(async (draftId) => {
    const res = await fetch(`/api/draft-purchases/${draftId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    })
    return await res.json()
  }, [])

  return { drafts, loading, fetchDrafts, fetchDraft, updateDraft, confirmDraft, cancelDraft }
}

/**
 * Parse a bill photo and create a draft purchase.
 * Standalone function — doesn't need hook state.
 * @param {string} imageBase64
 * @param {string} mimeType
 * @param {string} entityId
 * @param {string} [createdBy]
 * @returns {Promise<{draft: object, duplicate: boolean}>}
 */
export async function parseBill(imageBase64, mimeType, entityId, createdBy) {
  const res = await fetch('/api/bill-parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mimeType, entityId, createdBy }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Bill parse failed (${res.status})`)
  }

  return await res.json()
}
