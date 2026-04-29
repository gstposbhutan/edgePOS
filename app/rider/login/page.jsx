"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Phone, Lock, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"

export default function RiderLoginPage() {
  const router = useRouter()
  const [phone, setPhone]     = useState('')
  const [pin,   setPin]       = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/rider/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, pin }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Login failed')
        return
      }

      // Establish Supabase session from tokens
      const supabase = createClient()
      await supabase.auth.setSession({
        access_token:  data.access_token,
        refresh_token: data.refresh_token,
      })

      router.push('/rider')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center mx-auto shadow-lg shadow-primary/30">
            <span className="text-3xl">🛵</span>
          </div>
          <h1 className="text-2xl font-bold">Rider Portal</h1>
          <p className="text-sm text-muted-foreground">NEXUS BHUTAN Delivery</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">WhatsApp Number</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="tel"
                placeholder="+975 17 123 456"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="pl-9"
                required
                autoFocus
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">PIN</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="password"
                inputMode="numeric"
                placeholder="Enter your PIN"
                value={pin}
                onChange={e => setPin(e.target.value)}
                className="pl-9"
                required
                maxLength={6}
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-tibetan/10 border border-tibetan/30 rounded-lg">
              <p className="text-sm text-tibetan">{error}</p>
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full h-12 text-base">
            {loading
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in...</>
              : 'Sign In'
            }
          </Button>
        </form>
      </div>
    </div>
  )
}
