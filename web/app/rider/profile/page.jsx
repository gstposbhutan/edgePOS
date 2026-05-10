"use client"

import { useState } from "react"
import { ArrowLeft, Loader2 } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function RiderProfilePage() {
  const [currentPin, setCurrentPin] = useState('')
  const [newPin,     setNewPin]     = useState('')
  const [loading,    setLoading]    = useState(false)
  const [message,    setMessage]    = useState(null)
  const [error,      setError]      = useState(null)

  async function handleChangePin(e) {
    e.preventDefault()
    if (newPin.length < 4) { setError('PIN must be at least 4 digits'); return }
    setLoading(true); setError(null); setMessage(null)
    try {
      const res = await fetch('/api/rider/profile/pin', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_pin: currentPin, new_pin: newPin }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setMessage('PIN changed successfully')
      setCurrentPin(''); setNewPin('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center gap-3">
        <Link href="/rider">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <h1 className="font-semibold">Profile</h1>
      </header>

      <main className="max-w-md mx-auto px-4 py-6">
        <form onSubmit={handleChangePin} className="space-y-4">
          <h2 className="text-sm font-semibold">Change PIN</h2>
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">Current PIN</label>
            <Input type="password" inputMode="numeric" value={currentPin} onChange={e => setCurrentPin(e.target.value)} maxLength={6} required />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">New PIN (4–6 digits)</label>
            <Input type="password" inputMode="numeric" value={newPin} onChange={e => setNewPin(e.target.value)} maxLength={6} required />
          </div>
          {error   && <p className="text-sm text-tibetan">{error}</p>}
          {message && <p className="text-sm text-emerald-600">{message}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating...</> : 'Update PIN'}
          </Button>
        </form>
      </main>
    </div>
  )
}
