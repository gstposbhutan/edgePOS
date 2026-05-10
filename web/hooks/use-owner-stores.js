"use client"

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Fetches all stores an OWNER user manages.
 * Returns the list and helpers to switch the active store and create new ones.
 */
export function useOwnerStores(userId, subRole) {
  const supabase = createClient()
  const [stores,      setStores]      = useState([])
  const [loading,     setLoading]     = useState(false)

  const fetchStores = useCallback(async () => {
    if (!userId || subRole !== 'OWNER') return
    setLoading(true)
    const { data } = await supabase
      .from('owner_stores')
      .select('entity_id, is_primary, entities!inner(id, name, tpn_gstin, whatsapp_no, is_active)')
      .eq('owner_id', userId)
      .order('is_primary', { ascending: false })

    setStores((data ?? []).map(r => ({ ...r.entities, is_primary: r.is_primary })))
    setLoading(false)
  }, [userId, subRole])

  useEffect(() => { fetchStores() }, [fetchStores])

  const createStore = useCallback(async ({ name, tpn_gstin, whatsapp_no }) => {
    // Create entity
    const { data: entity, error: entityErr } = await supabase
      .from('entities')
      .insert({ name, tpn_gstin, whatsapp_no, role: 'RETAILER', is_active: true })
      .select('id, name, tpn_gstin, whatsapp_no, is_active')
      .single()

    if (entityErr) return { error: entityErr.message }

    // Link to owner
    const { error: linkErr } = await supabase
      .from('owner_stores')
      .insert({ owner_id: userId, entity_id: entity.id, is_primary: stores.length === 0 })

    if (linkErr) return { error: linkErr.message }

    await fetchStores()
    return { entity }
  }, [userId, stores.length, fetchStores])

  return { stores, loading, fetchStores, createStore }
}
