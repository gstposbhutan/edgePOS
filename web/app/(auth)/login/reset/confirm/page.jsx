"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/pelbu-db"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Logo } from "@/components/ui/logo"

// The recovery-link landing page. The browser Supabase client picks up the recovery token
// from the URL and establishes a short-lived session; the user then sets a new password.
export default function ResetConfirmPage() {
  const supaRef = useRef(null)
  const [ready, setReady] = useState(false)   // recovery session established?
  const [checked, setChecked] = useState(false)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supaRef.current = supabase
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setReady(true)
    })
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) setReady(true)
      setChecked(true)
    })
    return () => sub?.subscription?.unsubscribe?.()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError('Password must be at least 8 characters with a letter and a number'); return
    }
    setLoading(true)
    const supabase = supaRef.current || createClient()
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (err) { setError(err.message); return }
    setDone(true)
    // Land on the root — the proxy routes each role to its own home.
    setTimeout(() => { window.location.href = '/' }, 1500)
  }

  return (
    <div className="w-full max-w-sm mx-4">
      <div className="flex flex-col items-center mb-8">
        <Logo variant="stacked" className="h-28 w-auto mb-2" />
      </div>
      <Card className="glassmorphism">
        <CardHeader>
          <CardTitle className="text-lg font-serif">Set a new password</CardTitle>
          <CardDescription>Choose a strong password for your account.</CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-center">
              <p className="text-sm text-emerald-600">Password updated. Redirecting…</p>
            </div>
          ) : checked && !ready ? (
            <div className="space-y-4 text-center">
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
                <p className="text-xs text-destructive">This reset link is invalid or has expired.</p>
              </div>
              <Link href="/login/reset" className="text-sm text-primary hover:underline">Request a new link</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">New password</label>
                <Input type="password" placeholder="Min 8 chars, a letter & a number" value={password} onChange={e => setPassword(e.target.value)} autoFocus required />
              </div>
              {error && <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg"><p className="text-xs text-destructive">{error}</p></div>}
              <Button type="submit" disabled={loading || !ready} className="w-full bg-primary hover:bg-primary/90">
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : ready ? 'Update password' : 'Verifying link…'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
