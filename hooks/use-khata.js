"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"

/**
 * Manages khata (credit) accounts for a store entity.
 * @param {string} entityId — the creditor entity ID
 */
export function useKhata(entityId) {
  const supabase = createClient()

  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!entityId) return
    fetchAccounts()
  }, [entityId])

  async function fetchAccounts() {
    setLoading(true)
    const { data, error } = await supabase
      .from('khata_accounts')
      .select('*')
      .eq('creditor_entity_id', entityId)
      .order('updated_at', { ascending: false })

    if (!error && data) setAccounts(data)
    setLoading(false)
  }

  /**
   * Fetch a single khata account with its transaction ledger.
   * @param {string} accountId
   * @returns {Promise<{ account: object|null, transactions: object[] }>}
   */
  async function fetchAccount(accountId) {
    const { data: account } = await supabase
      .from('khata_accounts')
      .select('*')
      .eq('id', accountId)
      .single()

    const { data: transactions } = await supabase
      .from('khata_transactions')
      .select('*')
      .eq('khata_account_id', accountId)
      .order('created_at', { ascending: true })

    return { account, transactions: transactions ?? [] }
  }

  /**
   * Create a new khata account.
   * @param {{ party_type: string, debtor_entity_id?: string, debtor_phone?: string, debtor_name: string, credit_limit?: number, credit_term_days?: number }} data
   */
  async function createAccount(data) {
    const { data: account, error } = await supabase
      .from('khata_accounts')
      .insert({
        creditor_entity_id: entityId,
        ...data,
      })
      .select()
      .single()

    if (error) return { account: null, error: error.message }
    setAccounts(prev => [account, ...prev])
    return { account, error: null }
  }

  /**
   * Record a repayment against a khata account.
   * Creates a repayment row in CREATED status, then immediately confirms it (PAYMENT_MADE).
   * The DB trigger handles balance reduction.
   * @param {string} accountId
   * @param {number} amount
   * @param {string} paymentMethod
   * @param {{ referenceNo?: string, notes?: string, profileId: string }} opts
   */
  async function recordPayment(accountId, amount, paymentMethod, opts = {}) {
    const { data: repayment, error } = await supabase
      .from('khata_repayments')
      .insert({
        khata_account_id: accountId,
        amount,
        payment_method: paymentMethod,
        status: 'CREATED',
        reference_no: opts.referenceNo ?? null,
        notes: opts.notes ?? null,
        created_by: opts.profileId,
      })
      .select()
      .single()

    if (error) return { error: error.message }

    // Immediately confirm — trigger fires and reduces balance
    const { error: confirmError } = await supabase
      .from('khata_repayments')
      .update({
        status: 'PAYMENT_MADE',
        confirmed_by: opts.profileId,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', repayment.id)

    if (confirmError) return { error: confirmError.message }

    // Refresh accounts to reflect new balance
    await fetchAccounts()
    return { error: null }
  }

  /**
   * Adjust a khata account balance (OWNER only).
   * @param {string} accountId
   * @param {'WRITE_OFF'|'CORRECTION'} type
   * @param {number} amount — positive for WRITE_OFF (reduces balance), signed for CORRECTION
   * @param {string} reason
   * @param {string} profileId
   */
  async function adjustBalance(accountId, type, amount, reason, profileId) {
    // Compute new balance
    const { data: account } = await supabase
      .from('khata_accounts')
      .select('outstanding_balance')
      .eq('id', accountId)
      .single()

    if (!account) return { error: 'Account not found' }

    const adjAmount = type === 'WRITE_OFF' ? -Math.abs(amount) : amount
    const newBalance = Math.max(0, parseFloat(account.outstanding_balance) + adjAmount)

    const { error: updateError } = await supabase
      .from('khata_accounts')
      .update({
        outstanding_balance: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', accountId)

    if (updateError) return { error: updateError.message }

    // Log the adjustment
    const { error: txnError } = await supabase
      .from('khata_transactions')
      .insert({
        khata_account_id: accountId,
        transaction_type: 'ADJUSTMENT',
        amount: Math.abs(adjAmount),
        balance_after: newBalance,
        notes: `[${type}] ${reason}`,
        created_by: profileId,
      })

    if (txnError) return { error: txnError.message }

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
    const { error } = await supabase
      .from('khata_accounts')
      .update({
        credit_limit: limit,
        updated_at: new Date().toISOString(),
      })
      .eq('id', accountId)

    if (error) return { error: error.message }

    // Log limit change as adjustment
    await supabase
      .from('khata_transactions')
      .insert({
        khata_account_id: accountId,
        transaction_type: 'ADJUSTMENT',
        amount: 0,
        balance_after: (await supabase.from('khata_accounts').select('outstanding_balance').eq('id', accountId).single()).data?.outstanding_balance ?? 0,
        notes: `Credit limit set to Nu. ${limit}`,
        created_by: profileId,
      })

    await fetchAccounts()
    return { error: null }
  }

  /**
   * Freeze or close a khata account.
   * @param {string} accountId
   * @param {'FROZEN'|'CLOSED'} status
   */
  async function setAccountStatus(accountId, status) {
    const { error } = await supabase
      .from('khata_accounts')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', accountId)

    if (error) return { error: error.message }
    await fetchAccounts()
    return { error: null }
  }

  /**
   * Look up a khata account by phone number (for checkout).
   * @param {string} phone
   * @returns {Promise<{ account: object|null, error: string|null }>}
   */
  async function lookupAccount(phone) {
    const { data, error } = await supabase
      .from('khata_accounts')
      .select('*')
      .eq('creditor_entity_id', entityId)
      .eq('debtor_phone', phone)
      .eq('party_type', 'CONSUMER')
      .in('status', ['ACTIVE', 'FROZEN'])
      .limit(1)
      .single()

    if (error) return { account: null, error: null }
    return { account: data, error: null }
  }

  return {
    accounts, loading, fetchAccounts, fetchAccount, createAccount,
    recordPayment, adjustBalance, setCreditLimit, setAccountStatus, lookupAccount,
  }
}
