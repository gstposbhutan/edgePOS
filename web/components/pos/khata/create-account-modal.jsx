"use client"

import { useState } from "react"
import { Phone, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

/**
 * Create a new consumer khata (credit) account.
 * @param {{ open: boolean, onClose: () => void, onCreate: (data: object) => Promise<{ error: string|null }>, defaultPhone?: string }} props
 */
export function CreateAccountModal({ open, onClose, onCreate, defaultPhone }) {
  const [phone,    setPhone]    = useState(defaultPhone ?? '')
  const [name,     setName]     = useState('')
  const [limit,    setLimit]    = useState('0')
  const [termDays, setTermDays] = useState('30')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    const cleaned = phone.replace(/\s/g, '')
    if (!/^\+?[0-9]{8,15}$/.test(cleaned)) {
      setError('Enter a valid phone number')
      return
    }

    setLoading(true)
    const formatted = cleaned.startsWith('+') ? cleaned : `+${cleaned}`
    const { error: createError } = await onCreate({
      party_type: 'CONSUMER',
      debtor_phone: formatted,
      debtor_name: name.trim() || formatted,
      credit_limit: parseFloat(limit) || 0,
      credit_term_days: parseInt(termDays) || 30,
    })
    setLoading(false)

    if (createError) {
      setError(createError)
      return
    }

    setPhone('')
    setName('')
    setLimit('0')
    setTermDays('30')
    onClose()
  }

  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="font-serif">Create Khata Account</DialogTitle>
          <DialogDescription>
            Set up a credit account for this customer. Default limit is Nu. 0 (disabled until you raise it).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Customer Name</label>
            <Input
              placeholder="e.g. Dorji Wangchuk"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">WhatsApp Number</label>
            <div className="relative">
              <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="tel"
                placeholder="+975 17 123 456"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="pl-9"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Credit Limit (Nu.)</label>
              <Input
                type="number"
                min="0"
                step="100"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Term (days)</label>
              <Input
                type="number"
                min="0"
                step="1"
                value={termDays}
                onChange={(e) => setTermDays(e.target.value)}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Term = 0 disables due-date alerts. Default 30 days.
          </p>

          {error && (
            <p className="text-xs text-tibetan">{error}</p>
          )}

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1 bg-primary hover:bg-primary/90">
              {loading
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</>
                : 'Create Account'
              }
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
