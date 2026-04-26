"use client"

import { Suspense, useState, useRef, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Eye, EyeOff, Loader2, Phone, MessageCircle, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { signIn, signInWithWhatsApp, sendWhatsAppOtp, ROLE_HOME, getRoleClaims } from "@/lib/auth"

function LoginForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const redirect     = searchParams.get('redirect')

  // Tab state
  const [tab, setTab] = useState('email') // 'email' | 'whatsapp'

  // Email login state
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPwd,  setShowPwd]  = useState(false)

  // WhatsApp OTP state
  const [waPhone,    setWaPhone]    = useState('')
  const [waOtp,      setWaOtp]      = useState('')
  const [otpSent,    setOtpSent]    = useState(false)
  const [otpTimer,   setOtpTimer]   = useState(0)
  const otpInputs    = useRef([])

  // Shared state
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  // OTP resend countdown
  useEffect(() => {
    if (otpTimer <= 0) return
    const tick = setTimeout(() => setOtpTimer(t => t - 1), 1000)
    return () => clearTimeout(tick)
  }, [otpTimer])

  /** Email/password login */
  async function handleEmailSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { user, error: authError } = await signIn(email, password)

    if (authError) {
      setError(authError)
      setLoading(false)
      return
    }

    const { role } = getRoleClaims(user)
    const destination = redirect || ROLE_HOME[role] || '/pos'
    router.push(destination)
  }

  /** Send WhatsApp OTP */
  async function handleSendOtp(e) {
    e.preventDefault()
    setError(null)

    const cleaned = waPhone.replace(/\s/g, '')
    if (!/^\+?[0-9]{8,15}$/.test(cleaned)) {
      setError('Enter a valid phone number (e.g. +97517123456)')
      return
    }

    setLoading(true)
    const { error: sendError } = await sendWhatsAppOtp(
      cleaned.startsWith('+') ? cleaned : `+${cleaned}`
    )
    setLoading(false)

    if (sendError) {
      setError(sendError)
      return
    }

    setOtpSent(true)
    setOtpTimer(60) // 60-second cooldown before resend
    setWaOtp('')
  }

  /** Verify WhatsApp OTP and sign in */
  async function handleVerifyOtp(e) {
    e.preventDefault()
    setError(null)

    if (waOtp.length !== 6) {
      setError('Enter the 6-digit code')
      return
    }

    setLoading(true)
    const cleaned = waPhone.replace(/\s/g, '')
    const phone = cleaned.startsWith('+') ? cleaned : `+${cleaned}`

    const { user, error: authError } = await signInWithWhatsApp(phone, waOtp)

    if (authError) {
      setError(authError)
      setLoading(false)
      return
    }

    const { role } = getRoleClaims(user)
    const destination = redirect || ROLE_HOME[role] || '/pos'
    router.push(destination)
  }

  return (
    <div className="w-full max-w-sm mx-4">
      {/* Logo */}
      <div className="flex flex-col items-center mb-8">
        <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center mb-4 shadow-lg shadow-primary/30">
          <span className="text-3xl">🏔️</span>
        </div>
        <h1 className="text-2xl font-serif font-bold text-foreground">NEXUS BHUTAN</h1>
        <p className="text-sm text-muted-foreground mt-1">4K Edge-AI POS System</p>
      </div>

      {/* Login card */}
      <Card className="glassmorphism">
        <CardHeader>
          <CardTitle className="text-lg font-serif">Sign In</CardTitle>
          <CardDescription>Choose your preferred sign-in method</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Tab selector */}
          <div className="flex rounded-lg bg-muted/50 p-1 mb-6">
            <button
              type="button"
              onClick={() => { setTab('email'); setError(null) }}
              className={`flex-1 flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-all ${
                tab === 'email'
                  ? 'bg-background shadow text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Mail className="h-4 w-4" />
              Email
            </button>
            <button
              type="button"
              onClick={() => { setTab('whatsapp'); setError(null) }}
              className={`flex-1 flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-all ${
                tab === 'whatsapp'
                  ? 'bg-background shadow text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Phone className="h-4 w-4" />
              WhatsApp
            </button>
          </div>

          {/* Email form */}
          {tab === 'email' && (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
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
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
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
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in...</>
                  : 'Sign In'
                }
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                Forgot your password?{' '}
                <a href="/login/reset" className="text-primary hover:underline underline-offset-4">
                  Reset via Email or WhatsApp
                </a>
              </p>
            </form>
          )}

          {/* WhatsApp OTP form */}
          {tab === 'whatsapp' && !otpSent && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">WhatsApp Number</label>
                <div className="relative">
                  <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="tel"
                    placeholder="+975 17 123 456"
                    value={waPhone}
                    onChange={(e) => setWaPhone(e.target.value)}
                    className="pl-9"
                    autoFocus
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  We'll send a 6-digit verification code to your WhatsApp
                </p>
              </div>

              {error && (
                <div className="p-3 bg-tibetan/10 border border-tibetan/30 rounded-lg">
                  <p className="text-xs text-tibetan">{error}</p>
                </div>
              )}

              <Button type="submit" disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700">
                {loading
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending code...</>
                  : <><MessageCircle className="mr-2 h-4 w-4" /> Send Verification Code</>
                }
              </Button>
            </form>
          )}

          {/* OTP verification form */}
          {tab === 'whatsapp' && otpSent && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="text-center space-y-1">
                <p className="text-sm text-muted-foreground">
                  Code sent to <span className="font-medium text-foreground">{waPhone}</span>
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground text-center block">
                  Enter 6-digit code
                </label>
                <div className="flex gap-2 justify-center">
                  {[0, 1, 2, 3, 4, 5].map(i => (
                    <Input
                      key={i}
                      ref={el => otpInputs.current[i] = el}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={waOtp[i] ?? ''}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '')
                        const newOtp = waOtp.split('')
                        newOtp[i] = val
                        const joined = newOtp.join('').slice(0, 6)
                        setWaOtp(joined)
                        // Auto-advance to next input
                        if (val && i < 5) {
                          otpInputs.current[i + 1]?.focus()
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Backspace' && !waOtp[i] && i > 0) {
                          otpInputs.current[i - 1]?.focus()
                        }
                      }}
                      onPaste={(e) => {
                        e.preventDefault()
                        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
                        setWaOtp(pasted)
                        const nextIdx = Math.min(pasted.length, 5)
                        otpInputs.current[nextIdx]?.focus()
                      }}
                      className="w-11 h-12 text-center text-lg font-mono"
                      autoFocus={i === 0}
                    />
                  ))}
                </div>
              </div>

              {error && (
                <div className="p-3 bg-tibetan/10 border border-tibetan/30 rounded-lg">
                  <p className="text-xs text-tibetan">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={loading || waOtp.length !== 6}
                className="w-full bg-primary hover:bg-primary/90"
              >
                {loading
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying...</>
                  : 'Verify & Sign In'
                }
              </Button>

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => { setOtpSent(false); setWaOtp(''); setError(null) }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Change number
                </button>
                <button
                  type="button"
                  onClick={otpTimer <= 0 ? handleSendOtp : undefined}
                  disabled={otpTimer > 0}
                  className={otpTimer > 0
                    ? 'text-muted-foreground cursor-not-allowed'
                    : 'text-primary hover:underline underline-offset-4'
                  }
                >
                  {otpTimer > 0 ? `Resend in ${otpTimer}s` : 'Resend code'}
                </button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Footer */}
      <p className="text-center text-xs text-muted-foreground mt-6">
        © 2026 NEXUS BHUTAN · GST 2026 Compliant
      </p>

      <p className="text-center text-xs text-muted-foreground mt-2">
        Wholesaler?{' '}
        <a href="/signup/wholesaler" className="text-primary hover:underline underline-offset-4">
          Create your business account
        </a>
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
