"use client"

import { useState, useEffect } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * F8 sales-person picker. Lists the store's CASHIER/STAFF/MANAGER team and lets
 * the cashier attribute the sale to one of them.
 *
 * @param {{ selectedId?: string|null, onSelect: (id: string, name: string) => void, onClose: () => void }} props
 */
export function SalespersonPickerModal({ selectedId, onSelect, onClose }) {
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/pos/salespeople')
      .then(r => r.ok ? r.json() : { salespeople: [] })
      .then(d => setPeople(d.salespeople || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-xl shadow-lg w-full max-w-sm mx-4 flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">Select Sales Person</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="overflow-y-auto p-2 flex-1">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground text-center">Loading…</p>
          ) : people.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">No team members found.</p>
          ) : people.map(p => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id, p.full_name || p.sub_role)}
              className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center justify-between transition-colors ${p.id === selectedId ? 'bg-primary/10' : 'hover:bg-muted/50'}`}
            >
              <span className="text-sm font-medium">{p.full_name || 'Unnamed'}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{p.sub_role}</span>
            </button>
          ))}
        </div>
        <div className="px-4 py-2.5 border-t border-border flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Close (Esc)</Button>
        </div>
      </div>
    </div>
  )
}
