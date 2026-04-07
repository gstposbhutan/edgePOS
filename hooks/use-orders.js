"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"

/**
 * Fetches and manages orders for a store entity.
 * @param {string} entityId
 */
export function useOrders(entityId) {
  const supabase = createClient()

  const [orders,  setOrders]  = useState([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('ALL')

  const STATUS_GROUPS = {
    ALL:       null,
    ACTIVE:    ['PENDING_PAYMENT', 'PAYMENT_VERIFYING', 'CONFIRMED', 'PROCESSING', 'DISPATCHED'],
    COMPLETED: ['COMPLETED', 'DELIVERED'],
    CANCELLED: ['CANCELLED', 'PAYMENT_FAILED'],
    REFUNDS:   ['REFUND_REQUESTED', 'REFUND_APPROVED', 'REFUND_PROCESSING', 'REFUNDED', 'REFUND_REJECTED'],
  }

  useEffect(() => {
    if (!entityId) return
    fetchOrders()
  }, [entityId, filter])

  async function fetchOrders() {
    setLoading(true)
    let query = supabase
      .from('orders')
      .select('id, order_no, order_type, status, grand_total, gst_total, payment_method, buyer_whatsapp, created_at, updated_at')
      .eq('seller_id', entityId)
      .order('created_at', { ascending: false })
      .limit(100)

    const statuses = STATUS_GROUPS[filter]
    if (statuses) query = query.in('status', statuses)

    const { data } = await query
    setOrders(data ?? [])
    setLoading(false)
  }

  /**
   * Fetch a single order with full detail — items, timeline, refunds, replacements.
   * @param {string} orderId
   */
  async function fetchOrderDetail(orderId) {
    const [{ data: order }, { data: items }, { data: timeline }, { data: refunds }, { data: replacements }] =
      await Promise.all([
        supabase.from('orders').select('*').eq('id', orderId).single(),
        supabase.from('order_items').select('*').eq('order_id', orderId).order('created_at'),
        supabase.from('order_status_log').select('*').eq('order_id', orderId).order('created_at'),
        supabase.from('refunds').select('*').eq('order_id', orderId).order('created_at'),
        supabase.from('replacements').select('*').eq('order_id', orderId).order('created_at'),
      ])

    return { order, items: items ?? [], timeline: timeline ?? [], refunds: refunds ?? [], replacements: replacements ?? [] }
  }

  /**
   * Cancel an order (full cancellation).
   * Stock restored by DB trigger if order was CONFIRMED.
   */
  const cancelOrder = useCallback(async (orderId, reason, actorId, actorRole) => {
    const { error } = await supabase
      .from('orders')
      .update({
        status:              'CANCELLED',
        cancellation_reason: reason,
        cancelled_at:        new Date().toISOString(),
      })
      .eq('id', orderId)

    if (error) return { error: error.message }

    // Log the cancellation actor manually (trigger logs status, not actor)
    await supabase.from('order_status_log').insert({
      order_id:    orderId,
      from_status: 'CANCELLATION_REQUESTED',
      to_status:   'CANCELLED',
      actor_id:    actorId,
      actor_role:  actorRole,
      reason,
    })

    await fetchOrders()
    return { error: null }
  }, [entityId])

  /**
   * Request a refund for specific order items.
   * @param {string} orderId
   * @param {object[]} refundItems  [{ order_item_id, quantity, name }]
   * @param {string} reason
   * @param {string} requestedBy  user_profile id
   */
  const requestRefund = useCallback(async (orderId, refundItems, reason, requestedBy) => {
    const order = orders.find(o => o.id === orderId)
    if (!order) return { error: 'Order not found' }

    // Calculate refund amounts from order_items
    const { data: items } = await supabase
      .from('order_items')
      .select('id, total, gst_5, quantity')
      .in('id', refundItems.map(i => i.order_item_id))

    if (!items?.length) return { error: 'No items found' }

    const refundAmount = items.reduce((sum, i) => {
      const refundItem = refundItems.find(ri => ri.order_item_id === i.id)
      const ratio = (refundItem?.quantity ?? i.quantity) / i.quantity
      return sum + parseFloat(i.total) * ratio
    }, 0)

    const gstReversal = items.reduce((sum, i) => {
      const refundItem = refundItems.find(ri => ri.order_item_id === i.id)
      const ratio = (refundItem?.quantity ?? i.quantity) / i.quantity
      return sum + parseFloat(i.gst_5) * ratio
    }, 0)

    const errors = []
    for (const ri of refundItems) {
      const { error } = await supabase.from('refunds').insert({
        order_id:      orderId,
        order_item_id: ri.order_item_id,
        quantity:      ri.quantity,
        refund_type:   'PARTIAL',
        refund_method: order.payment_method,
        amount:        parseFloat((refundAmount / refundItems.length).toFixed(2)),
        gst_reversal:  parseFloat((gstReversal / refundItems.length).toFixed(2)),
        reason,
        requested_by:  requestedBy,
        status:        'REQUESTED',
      })
      if (error) errors.push(error.message)
    }

    if (errors.length) return { error: errors[0] }

    await supabase.from('orders').update({ status: 'REFUND_REQUESTED' }).eq('id', orderId)
    await fetchOrders()
    return { error: null }
  }, [orders])

  /**
   * Approve a refund.
   */
  const approveRefund = useCallback(async (refundId, orderId, approvedBy) => {
    const { error } = await supabase
      .from('refunds')
      .update({ status: 'APPROVED', approved_by: approvedBy })
      .eq('id', refundId)

    if (error) return { error: error.message }

    await supabase.from('orders').update({ status: 'REFUND_APPROVED' }).eq('id', orderId)

    // Mark order_item as REFUNDED — triggers stock restoration
    const { data: refund } = await supabase.from('refunds').select('order_item_id').eq('id', refundId).single()
    if (refund?.order_item_id) {
      await supabase.from('order_items').update({ status: 'REFUNDED' }).eq('id', refund.order_item_id)
    }

    await fetchOrders()
    return { error: null }
  }, [])

  /**
   * Request a replacement for a specific order item.
   */
  const requestReplacement = useCallback(async (orderId, orderItemId, reason, requestedBy) => {
    const { error } = await supabase.from('replacements').insert({
      original_order_id: orderId,
      order_item_id:     orderItemId,
      reason,
      requested_by:      requestedBy,
      status:            'REQUESTED',
    })

    if (error) return { error: error.message }

    await supabase.from('orders').update({ status: 'REPLACEMENT_REQUESTED' }).eq('id', orderId)
    await fetchOrders()
    return { error: null }
  }, [])

  return {
    orders, loading, filter, setFilter,
    fetchOrders, fetchOrderDetail,
    cancelOrder, requestRefund, approveRefund, requestReplacement,
  }
}
