'use client'

import { Suspense, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, Phone, Building2, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'

function SignupForm() {
  const router = useRouter()

  const [businessName, setBusinessName] = useState('')
  const [whatsappNo, setWhatsappNo] = useState('')
  const [tpnGstin, setTpnGstin] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/auth/signup/vendor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'WHOLESALER',
          name: businessName,
          whatsapp_no: whatsappNo,
          tpn_gstin: tpnGstin || undefined,
          email,
          password,
          full_name: fullName,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Signup failed')
        setLoading(false)
        return
      }

      // If session tokens returned, set session and redirect
      if (data.access_token) {
        const supabase = createClient()
        await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        })
        router.push('/admin')
      } else {
        // Account created but no session — go to login
        router.push('/login?message=Account+created.+Please+sign+in.')
      }
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm mx-4">
      {/* Logo */}
      <div className="flex flex-col items-center mb-8">
        <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center mb-4 shadow-lg shadow-primary/30">
          <Building2 className="h-8 w-8 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-serif font-bold text-foreground">NEXUS BHUTAN</h1>
        <p className="text-sm text-muted-foreground mt-1">Wholesaler Registration</p>
      </div>

      {/* Signup card */}
      <Card className="glassmorphism">
        <CardHeader>
          <CardTitle className="text-lg font-serif">Create Business Account</CardTitle>
          <CardDescription>Set up your wholesale business in minutes</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Business Details */}
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Business Details</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Business Name</label>
              <Input
                placeholder="e.g. Thimphu Wholesale Traders"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
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
                  value={whatsappNo}
                  onChange={(e) => setWhatsappNo(e.target.value)}
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">TPN / GSTIN</label>
              <Input
                placeholder="e.g. TPN0001234"
                value={tpnGstin}
                onChange={(e) => setTpnGstin(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Required for GST 2026 compliance</p>
            </div>

            {/* Divider */}
            <div className="border-t border-border pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Owner Account</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Your Full Name</label>
              <Input
                placeholder="e.g. Karma Tshering"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Email</label>
              <Input
                type="email"
                placeholder="you@business.bt"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Password</label>
              <div className="relative">
                <Input
                  type={showPwd ? 'text' : 'password'}
                  placeholder="Min 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-tibetan/10 border border-tibetan/30 rounded-lg">
                <p className="text-xs text-tibetan">{error}</p>
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90">
              {loading
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating account...</>
                : 'Create Business Account'
              }
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Back to login */}
      <div className="text-center mt-6 space-y-2">
        <p className="text-xs text-muted-foreground">
          Already have an account?{' '}
          <a href="/login" className="text-primary hover:underline underline-offset-4">
            Sign in
          </a>
        </p>
        <p className="text-xs text-muted-foreground">
          Retailer?{' '}
          <a href="/signup/retailer" className="text-primary hover:underline underline-offset-4">
            Create a retail account
          </a>
        </p>
      </div>
    </div>
  )
}

export default function WholesalerSignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  )
}
