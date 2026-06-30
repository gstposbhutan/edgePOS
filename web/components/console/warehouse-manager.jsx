"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, RefreshCw, Pencil, Trash2, Warehouse as WarehouseIcon, Loader2, Star, ToggleLeft, ToggleRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

/**
 * Warehouses section for the wholesaler console. Lists the vendor's own depots
 * (everything from /api/console/warehouses is already scoped to their entity) with
 * add / edit / activate-toggle / delete. Records only — no per-warehouse inventory.
 */
export function WarehouseManager() {
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [busyId,  setBusyId]  = useState(null) // id mid-toggle/delete (disables its row actions)
  const [showForm, setShowForm] = useState(false)
  const [editing,  setEditing]  = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/console/warehouses')
      const data = await res.json()
      if (res.ok) setRows(data.warehouses ?? [])
    } catch {
      // leave the current list in place on a transient error
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function save(form) {
    setSaving(true)
    try {
      const res = editing
        ? await fetch(`/api/console/warehouses/${editing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form),
          })
        : await fetch('/api/console/warehouses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form),
          })
      const data = await res.json()
      if (!res.ok) { setSaving(false); return { error: data.error } }
      await load()
      setSaving(false)
      return { error: null }
    } catch (err) {
      setSaving(false)
      return { error: err.message }
    }
  }

  async function toggleActive(row) {
    setBusyId(row.id)
    const next = !row.is_active
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, is_active: next } : r))
    try {
      const res = await fetch(`/api/console/warehouses/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: next }),
      })
      if (!res.ok) throw new Error('request failed')
    } catch {
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, is_active: !next } : r)) // roll back
    } finally {
      setBusyId(null)
    }
  }

  async function setPrimary(row) {
    if (row.is_primary) return
    setBusyId(row.id)
    try {
      const res = await fetch(`/api/console/warehouses/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_primary: true }),
      })
      if (!res.ok) throw new Error('request failed')
      await load() // a primary change clears the flag elsewhere — refetch to stay consistent
    } catch {
      // leave list unchanged on failure
    } finally {
      setBusyId(null)
    }
  }

  async function remove(row) {
    if (!window.confirm(`Delete "${row.name}"? This can't be undone.`)) return
    setBusyId(row.id)
    try {
      const res = await fetch(`/api/console/warehouses/${row.id}`, { method: 'DELETE' })
      if (res.ok) setRows(prev => prev.filter(r => r.id !== row.id))
    } catch {
      // leave list unchanged on failure
    } finally {
      setBusyId(null)
    }
  }

  function openAdd()  { setEditing(null); setShowForm(true) }
  function openEdit(row) { setEditing(row); setShowForm(true) }
  function closeForm() { setShowForm(false); setEditing(null) }

  return (
    <div className="space-y-4">
      {/* Heading + add */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h2 className="text-lg font-serif font-bold text-foreground">Warehouses</h2>
          <p className="text-xs text-muted-foreground">{rows.length} location{rows.length === 1 ? '' : 's'} — your buildings &amp; depots</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={load} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button onClick={openAdd} className="bg-primary hover:bg-primary/90" size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add Warehouse
        </Button>
      </div>

      {/* List */}
      <div className="rounded-lg border border-border overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-muted-foreground">
            <WarehouseIcon className="h-12 w-12 opacity-20" />
            <p className="text-sm">No warehouses yet</p>
            <Button onClick={openAdd} className="bg-primary hover:bg-primary/90" size="sm">
              <Plus className="h-4 w-4 mr-1.5" /> Add your first warehouse
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map(row => (
              <WarehouseRow
                key={row.id}
                row={row}
                busy={busyId === row.id}
                onEdit={() => openEdit(row)}
                onToggle={() => toggleActive(row)}
                onPrimary={() => setPrimary(row)}
                onDelete={() => remove(row)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add / edit modal */}
      <WarehouseForm
        open={showForm}
        warehouse={editing}
        saving={saving}
        onSave={save}
        onClose={closeForm}
      />
    </div>
  )
}

function WarehouseRow({ row, busy, onEdit, onToggle, onPrimary, onDelete }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors ${!row.is_active ? 'opacity-50' : ''}`}>
      {/* Icon */}
      <div className="h-10 w-10 shrink-0 rounded-lg bg-muted flex items-center justify-center">
        <WarehouseIcon className="h-5 w-5 text-muted-foreground" />
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onEdit}>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-foreground truncate">{row.name}</p>
          {row.is_primary && (
            <Badge className="bg-gold/10 text-gold border border-gold/20 text-[10px] px-1.5 py-0">Primary</Badge>
          )}
          {!row.is_active && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Inactive</Badge>}
        </div>
        {row.address && <p className="text-xs text-muted-foreground truncate mt-0.5">{row.address}</p>}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onPrimary}
          disabled={busy || row.is_primary}
          title={row.is_primary ? 'Primary warehouse' : 'Make primary'}
          className={`transition-colors disabled:opacity-50 disabled:cursor-default ${row.is_primary ? 'text-gold' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Star className="h-4 w-4" fill={row.is_primary ? 'currentColor' : 'none'} />
        </button>
        <button
          onClick={onToggle}
          disabled={busy}
          title={row.is_active ? 'Deactivate' : 'Activate'}
          className={`transition-colors disabled:opacity-50 ${row.is_active ? 'text-emerald-600 hover:text-emerald-700' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {row.is_active ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
        </button>
        <Button variant="ghost" size="icon-sm" onClick={onEdit} title="Edit">
          <Pencil className="h-4 w-4" />
        </Button>
        <button
          onClick={onDelete}
          disabled={busy}
          title="Delete"
          className="text-muted-foreground hover:text-tibetan transition-colors disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

const EMPTY_FORM = { name: '', address: '', is_primary: false, is_active: true }

function WarehouseForm({ open, warehouse, saving, onSave, onClose }) {
  const isEdit = !!warehouse
  const [form,  setForm]  = useState(EMPTY_FORM)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (warehouse) {
      setForm({
        name:       warehouse.name ?? '',
        address:    warehouse.address ?? '',
        is_primary: !!warehouse.is_primary,
        is_active:  warehouse.is_active ?? true,
      })
    } else {
      setForm(EMPTY_FORM)
    }
    setError(null)
  }, [warehouse, open])

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) return setError('Warehouse name is required')

    const { error: saveError } = await onSave({
      name:       form.name.trim(),
      address:    form.address.trim(),
      is_primary: form.is_primary,
      is_active:  form.is_active,
    })
    if (saveError) setError(saveError)
    else handleClose()
  }

  function handleClose() {
    setForm(EMPTY_FORM)
    setError(null)
    onClose()
  }

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif">{isEdit ? 'Edit Warehouse' : 'Add Warehouse'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update this location.' : 'Add a building or depot where you store stock.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Name <span className="text-tibetan">*</span></label>
            <Input
              placeholder="e.g. Thimphu Main Depot"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              required
              autoFocus={!isEdit}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Address</label>
            <textarea
              placeholder="Building, street, town"
              value={form.address}
              onChange={e => set('address', e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
            />
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg border border-border bg-muted/20">
            <input
              id="warehouse_is_primary"
              type="checkbox"
              checked={!!form.is_primary}
              onChange={e => set('is_primary', e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
            />
            <label htmlFor="warehouse_is_primary" className="text-sm cursor-pointer">
              <span className="font-medium text-foreground">Primary warehouse</span>
              <span className="block text-[10px] text-muted-foreground">Your main location. Setting this clears it on any other warehouse.</span>
            </label>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg border border-border bg-muted/20">
            <input
              id="warehouse_is_active"
              type="checkbox"
              checked={!!form.is_active}
              onChange={e => set('is_active', e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
            />
            <label htmlFor="warehouse_is_active" className="text-sm cursor-pointer">
              <span className="font-medium text-foreground">Active</span>
              <span className="block text-[10px] text-muted-foreground">Inactive locations stay on record but are flagged as not in use.</span>
            </label>
          </div>

          {error && <p className="text-xs text-tibetan">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="flex-1 bg-primary hover:bg-primary/90">
              {saving
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                : isEdit ? 'Save Changes' : 'Add Warehouse'
              }
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
