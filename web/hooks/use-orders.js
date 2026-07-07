"use client"

import { useState, useEffect, useCallback } from "react"

/**
 * Fetches and manages orders for a store entity via API routes.
 * @param {string} entityId
 */
export function useOrders(entityId) {
  const [orders,  setOrders]  = useState([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('ALL')

  useEffect(() => {
    if (!entityId) return
    fetchOrders()
  }, [entityId, filter])

  async function fetchOrders() {
    setLoading(true)
    try {
      const res = await fetch(`/api/pos/orders/list?filter=${filter}`)
      const data = await res.json()
      if (res.ok) setOrders(data.orders ?? [])
    } catch {
      // leave orders unchanged
    }
    setLoading(false)
  }

  /**
   * Fetch a single order with full detail — items, timeline, refunds, replacements.
   * @param {string} orderId
   */
  async function fetchOrderDetail(orderId) {
    const res = await fetch(`/api/pos/orders/${orderId}`)
    const data = await res.json()

    return {
      order: data.order ?? null,
      items: data.items ?? [],
      timeline: data.timeline ?? [],
      refunds: data.refunds ?? [],
      replacements: data.replacements ?? [],
      khataAccount: data.khataAccount ?? null,
      customerName: data.customerName ?? null,
    }
  }

  /**
   * Cancel an order (full cancellation).
   * Stock restored by DB trigger if order was CONFIRMED.
   */
  const cancelOrder = useCallback(async (orderId, reason, actorId, actorRole, items) => {
    const res = await fetch(`/api/pos/orders/${orderId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `items` (optional) → partial cancellation: [{ id, quantity }] of the lines to return to stock.
      body: JSON.stringify({ reason, actor_id: actorId, actor_role: actorRole, items }),
    })
    const data = await res.json()
    if (!res.ok) return { error: data.error }

    await fetchOrders()
    return { error: null }
  }, [filter])

  /**
   * Request a refund for specific order items.
   * @param {string} orderId
   * @param {object[]} refundItems  [{ order_item_id, quantity, name }]
   * @param {string} reason
   * @param {string} requestedBy  user_profile id
   */
  const requestRefund = useCallback(async (orderId, refundItems, reason, requestedBy) => {
    const res = await fetch(`/api/pos/orders/${orderId}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refundItems, reason, requestedBy }),
    })
    const data = await res.json()
    if (!res.ok) return { error: data.error }

    await fetchOrders()
    return { error: null }
  }, [filter])

  /**
   * Approve a refund.
   */
  const approveRefund = useCallback(async (refundId, orderId, approvedBy) => {
    const res = await fetch(`/api/pos/orders/${orderId}/refund/${refundId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await res.json()
    if (!res.ok) return { error: data.error }

    await fetchOrders()
    return { error: null }
  }, [filter])

  /**
   * Request a replacement for a specific order item.
   */
  const requestReplacement = useCallback(async (orderId, orderItemId, reason, requestedBy) => {
    const res = await fetch(`/api/pos/orders/${orderId}/replace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderItemId, reason }),
    })
    const data = await res.json()
    if (!res.ok) return { error: data.error }

    await fetchOrders()
    return { error: null }
  }, [filter])

  return {
    orders, loading, filter, setFilter,
    fetchOrders, fetchOrderDetail,
    cancelOrder, requestRefund, approveRefund, requestReplacement,
  }
}
