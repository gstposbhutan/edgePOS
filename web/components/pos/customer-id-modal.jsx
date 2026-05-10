"use client"

import { useState } from "react"
import { Phone, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

/**
 * Captures customer WhatsApp number before checkout.
 * Shown when no customer is identified and cashier attempts to confirm order.
 *
 * @param {{ open: boolean, onIdentify: (whatsapp: string) => void, onClose: () => void }} props
 */
export function CustomerIdModal({ open, onIdentify, onClose }) {
  const [whatsapp, setWhatsapp] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    // Basic E.164 validation for Bhutan (+975...)
    const cleaned = whatsapp.replace(/\s/g, '')
    if (!/^\+?[0-9]{8,15}$/.test(cleaned)) {
      setError('Enter a valid WhatsApp number (e.g. +97517123456)')
      return
    }

    setLoading(true)
    await onIdentify(cleaned.startsWith('+') ? cleaned : `+${cleaned}`)
    setLoading(false)
    setWhatsapp('')
  }

  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="font-serif">Identify Customer</DialogTitle>
          <DialogDescription>
            Every transaction requires a customer identity. Enter their WhatsApp number to proceed.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">WhatsApp Number</label>
            <div className="relative">
              <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="tel"
                placeholder="+975 17 123 456"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                className="pl-9"
                autoFocus
                required
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-tibetan">{error}</p>
          )}

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1 bg-primary hover:bg-primary/90">
              {loading
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                : 'Confirm Customer'
              }
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
