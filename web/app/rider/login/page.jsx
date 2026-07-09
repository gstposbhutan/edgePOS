"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Mail, KeyRound, Loader2, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function RiderLoginPage() {
  const router = useRouter()
  const [step, setStep]       = useState('email')   // 'email' | 'code'
  const [email, setEmail]     = useState('')
  const [code, setCode]       = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [info, setInfo]       = useState(null)

  async function sendCode(e) {
    e?.preventDefault()
    setError(null); setInfo(null); setLoading(true)
    try {
      const res = await fetch('/api/rider/auth/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not send code'); return }
      setStep('code')
      setInfo(data.otp ? `Dev code: ${data.otp}` : `We emailed a 6-digit code to ${email.trim()}.`)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  async function verify(e) {
    e.preventDefault()
    setError(null); setLoading(true)
    try {
      const res = await fetch('/api/rider/auth/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: code }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Login failed'); return }
      router.push('/rider')
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center mx-auto shadow-lg shadow-primary/30">
            <span className="text-3xl">🛵</span>
          </div>
          <h1 className="text-2xl font-bold">Rider Portal</h1>
          <p className="text-sm text-muted-foreground">Pelbu Delivery</p>
        </div>

        {step === 'email' ? (
          <form onSubmit={sendCode} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="email" placeholder="you@example.com" value={email}
                  onChange={e => setEmail(e.target.value)} className="pl-9" required autoFocus />
              </div>
              <p className="text-xs text-muted-foreground">We'll email you a 6-digit login code.</p>
            </div>
            {error && <div className="p-3 bg-tibetan/10 border border-tibetan/30 rounded-lg"><p className="text-sm text-tibetan">{error}</p></div>}
            <Button type="submit" disabled={loading} className="w-full h-12 text-base">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</> : 'Send code'}
            </Button>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-4">
            {info && <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg"><p className="text-sm">{info}</p></div>}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Login code</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="text" inputMode="numeric" maxLength={6} placeholder="123456" value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, ''))} className="pl-9 tracking-widest" required autoFocus />
              </div>
            </div>
            {error && <div className="p-3 bg-tibetan/10 border border-tibetan/30 rounded-lg"><p className="text-sm text-tibetan">{error}</p></div>}
            <Button type="submit" disabled={loading || code.length !== 6} className="w-full h-12 text-base">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in...</> : 'Sign in'}
            </Button>
            <div className="flex items-center justify-between text-xs">
              <button type="button" onClick={() => { setStep('email'); setError(null); setCode('') }}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3 w-3" /> Change email
              </button>
              <button type="button" onClick={sendCode} disabled={loading} className="text-primary hover:underline">
                Resend code
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
