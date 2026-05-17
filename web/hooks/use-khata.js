"use client"

import { useState, useEffect, useCallback } from "react"

/**
 * Manages khata (credit) accounts for a store entity via API routes.
 * @param {string} entityId — the creditor entity ID
 */
export function useKhata(entityId) {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!entityId) return
    fetchAccounts()
  }, [entityId])

  async function fetchAccounts() {
    setLoading(true)
    try {
      const res = await fetch('/api/pos/khata')
      const data = await res.json()
      if (res.ok && data.accounts) setAccounts(data.accounts)
    } catch {
      // leave accounts unchanged on error
    }
    setLoading(false)
  }

  /**
   * Fetch a single khata account with its transaction ledger.
   * @param {string} accountId
   * @returns {Promise<{ account: object|null, transactions: object[] }>}
   */
  async function fetchAccount(accountId) {
    const res = await fetch(`/api/pos/khata/${accountId}`)
    const data = await res.json()
    return { account: data.account ?? null, transactions: data.transactions ?? [] }
  }

  /**
   * Create a new khata account.
   * @param {{ party_type: string, debtor_entity_id?: string, debtor_phone?: string, debtor_name: string, credit_limit?: number, credit_term_days?: number }} data
   */
  async function createAccount(data) {
    const res = await fetch('/api/pos/khata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const result = await res.json()

    if (!res.ok) return { account: null, error: result.error }

    setAccounts(prev => [result.account, ...prev])
    return { account: result.account, error: null }
  }

  /**
   * Record a repayment against a khata account.
   * @param {string} accountId
   * @param {number} amount
   * @param {string} paymentMethod
   * @param {{ referenceNo?: string, notes?: string, profileId: string }} opts
   */
  async function recordPayment(accountId, amount, paymentMethod, opts = {}) {
    const res = await fetch(`/api/pos/khata/${accountId}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        payment_method: paymentMethod,
        reference_no: opts.referenceNo ?? null,
        notes: opts.notes ?? null,
      }),
    })
    const data = await res.json()
    if (!res.ok) return { error: data.error }

    await fetchAccounts()
    return { error: null }
  }

  /**
   * Adjust a khata account balance (OWNER only).
   * @param {string} accountId
   * @param {'WRITE_OFF'|'CORRECTION'} type
   * @param {number} amount
   * @param {string} reason
   * @param {string} profileId
   */
  async function adjustBalance(accountId, type, amount, reason, profileId) {
    const res = await fetch(`/api/pos/khata/${accountId}/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, amount, reason }),
    })
    const data = await res.json()
    if (!res.ok) return { error: data.error }

    await fetchAccounts()
    return { error: null }
  }

  /**
   * Set the credit limit on a khata account (OWNER only).
   * @param {string} accountId
   * @param {number} limit
   * @param {string} profileId
   */
  async function setCreditLimit(accountId, limit, profileId) {
    const res = await fetch(`/api/pos/khata/${accountId}/credit-limit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit }),
    })
    const data = await res.json()
    if (!res.ok) return { error: data.error }

    await fetchAccounts()
    return { error: null }
  }

  /**
   * Freeze or close a khata account.
   * @param {string} accountId
   * @param {'FROZEN'|'CLOSED'} status
   */
  async function setAccountStatus(accountId, status) {
    const res = await fetch(`/api/pos/khata/${accountId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    const data = await res.json()
    if (!res.ok) return { error: data.error }

    await fetchAccounts()
    return { error: null }
  }

  /**
   * Look up a khata account by phone number (for checkout).
   * @param {string} phone
   * @returns {Promise<{ account: object|null, error: string|null }>}
   */
  async function lookupAccount(phone) {
    const res = await fetch(`/api/pos/khata/lookup?phone=${encodeURIComponent(phone)}`)
    const data = await res.json()
    if (!res.ok) return { account: null, error: data.error }
    return { account: data.account ?? null, error: null }
  }

  return {
    accounts, loading, fetchAccounts, fetchAccount, createAccount,
    recordPayment, adjustBalance, setCreditLimit, setAccountStatus, lookupAccount,
  }
}
