"use client"

import { useState, useEffect } from "react"
import { X, Landmark } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"

export function StartShiftModal({ onOpen, onClose }) {
  const supabase = createClient()
  const [registers, setRegisters] = useState([])
  const [selected, setSelected] = useState(null)
  const [float, setFloat] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadRegisters() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setLoading(false); return }

      const res = await fetch('/api/cash-registers', {
        headers: { authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      const active = (data.registers || []).filter(r => r.is_active)
      setRegisters(active)

      if (active.length === 1) {
        setSelected(active[0].id)
        setFloat(String(active[0].default_opening_float))
      }
      setLoading(false)
    }
    loadRegisters()
  }, [])

  function handleRegisterChange(id) {
    setSelected(id)
    const reg = registers.find(r => r.id === id)
    if (reg) setFloat(String(reg.default_opening_float))
  }

  async function handleSubmit() {
    if (!selected) { setError('Select a register'); return }
    const openingFloat = parseFloat(float)
    if (isNaN(openingFloat) || openingFloat < 0) { setError('Enter a valid float amount'); return }

    setSubmitting(true)
    setError('')
    try {
      await onOpen(selected, openingFloat)
    } catch (e) {
      setError(e.message)
    }
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-xl shadow-lg w-full max-w-sm mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold">Start Shift</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loading ? (
            <div className="h-10 rounded-lg bg-muted animate-pulse" />
          ) : registers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No active registers. Ask a manager to create one first.
            </p>
          ) : (
            <>
              {/* Register picker */}
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Cash Register</label>
                {registers.length === 1 ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm">
                    <Landmark className="h-4 w-4 text-muted-foreground" />
                    {registers[0].name}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {registers.map(reg => (
                      <button
                        key={reg.id}
                        onClick={() => handleRegisterChange(reg.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-colors ${
                          selected === reg.id
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-border hover:bg-muted/50'
                        }`}
                      >
                        <Landmark className="h-4 w-4 shrink-0" />
                        <span className="flex-1">{reg.name}</span>
                        <span className="text-xs text-muted-foreground">Nu. {parseFloat(reg.default_opening_float).toFixed(0)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Opening float */}
              {selected && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Opening Float (Nu.)</label>
                  <Input
                    type="number"
                    value={float}
                    onChange={e => setFloat(e.target.value)}
                    min="0"
                    step="100"
                    className="text-lg font-semibold"
                    autoFocus
                  />
                </div>
              )}

              {error && <p className="text-xs text-tibetan">{error}</p>}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-border">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            className="flex-1"
            onClick={handleSubmit}
            disabled={submitting || !selected || registers.length === 0}
          >
            {submitting ? 'Starting...' : 'Start Shift'}
          </Button>
        </div>
      </div>
    </div>
  )
}
