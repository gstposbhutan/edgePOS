"use client"

import { useState } from "react"
import Link from "next/link"
import { Loader2, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Logo } from "@/components/ui/logo"

// Password-reset request. Sends a GoTrue recovery email; the link lands on /login/reset/confirm.
export default function ResetRequestPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Enter a valid email address'); return }
    setLoading(true)
    try {
      await fetch('/api/auth/reset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      setSent(true)   // always show success (avoid account enumeration)
    } catch { setError('Something went wrong. Please try again.') }
    setLoading(false)
  }

  return (
    <div className="w-full max-w-sm mx-4">
      <div className="flex flex-col items-center mb-8">
        <Logo variant="stacked" className="h-28 w-auto mb-2" />
      </div>
      <Card className="glassmorphism">
        <CardHeader>
          <CardTitle className="text-lg font-serif">Reset your password</CardTitle>
          <CardDescription>We&apos;ll email you a secure link to set a new one.</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4 text-center">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                <p className="text-sm text-emerald-600">If an account exists for <span className="font-medium">{email}</span>, a reset link is on its way.</p>
              </div>
              <Link href="/login" className="text-sm text-primary hover:underline">Back to sign in</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Email</label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} className="pl-9" autoFocus required />
                </div>
              </div>
              {error && <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg"><p className="text-xs text-destructive">{error}</p></div>}
              <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90">
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</> : 'Email me a reset link'}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Remembered it? <Link href="/login" className="text-primary hover:underline">Back to sign in</Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
