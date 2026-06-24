"use client"

import { useState, useEffect } from "react"
import { X, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Alt+D — Delivery Address (v1). Attaches a delivery address to the next sale
 * (orders.delivery_address). delivery_fee is left null — the rider/logistics
 * step is a later integration.
 *
 * @param {{ initialAddress?: string|null, onApply: (address: string) => void, onClear: () => void, onClose: () => void }} props
 */
export function DeliveryAddressModal({ initialAddress, onApply, onClear, onClose }) {
  const [address, setAddress] = useState(initialAddress || '')

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-xl shadow-lg w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold flex items-center gap-2"><MapPin className="h-4 w-4" /> Delivery Address</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 space-y-2 text-sm">
          <p className="text-muted-foreground">Attach a delivery address to this sale. The delivery fee and rider assignment are handled later.</p>
          <textarea
            autoFocus
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="House no, street, locality, landmark, town…"
            rows={4}
            className="w-full px-2 py-1.5 rounded border border-input bg-background text-sm resize-none"
          />
        </div>
        <div className="px-4 py-3 border-t border-border flex gap-2 justify-between">
          <Button variant="ghost" size="sm" onClick={() => { onClear(); onClose() }}>Clear</Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" disabled={!address.trim()} onClick={() => { onApply(address.trim()); onClose() }}>Save</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
