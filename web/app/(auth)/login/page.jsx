"use client"

import { Suspense, useState, useRef, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Eye, EyeOff, Loader2, Mail, Phone, KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Logo } from "@/components/ui/logo"
import { signIn, sendEmailOtp, signInWithEmailOtp, setCustomerPhone, ROLE_HOME, getRoleClaims } from "@/lib/auth"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect')
  const needPhoneParam = searchParams.get('needphone')
  // Customers arrive from the marketplace; staff from consoles.
  const [tab, setTab] = useState(needPhoneParam || (redirect && redirect.startsWith('/shop')) ? 'customer' : 'staff')

  // Staff (email + password)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)

  // Customer (email OTP)
  const [custEmail, setCustEmail] = useState('')
  const [code, setCode] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpTimer, setOtpTimer] = useState(0)
  const [otpMessage, setOtpMessage] = useState(null)
  const codeInputs = useRef([])
  // Phone capture (mandatory for customers)
  const [phoneStep, setPhoneStep] = useState(!!needPhoneParam)
  const [phone, setPhone] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (otpTimer <= 0) return
    const t = setTimeout(() => setOtpTimer(x => x - 1), 1000)
    return () => clearTimeout(t)
  }, [otpTimer])

  const custDestination = redirect || '/shop'

  async function handleStaffSubmit(e) {
    e.preventDefault()
    setError(null); setLoading(true)
    const { user, error: authError } = await signIn(email, password)
    if (authError) { setError(authError); setLoading(false); return }
    const { role } = getRoleClaims(user)
    router.push(redirect || ROLE_HOME[role] || '/pos')
  }

  async function handleSendCode(e) {
    e?.preventDefault()
    setError(null); setOtpMessage(null)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(custEmail.trim())) { setError('Enter a valid email address'); return }
    setLoading(true)
    const { success, otp, error: err } = await sendEmailOtp(custEmail.trim())
    setLoading(false)
    if (!success) { setError(err); return }
    setOtpSent(true); setOtpTimer(60)
    if (otp) { setCode(otp); setOtpMessage(`Demo code: ${otp}`) } else { setCode('') }
  }

  async function handleVerifyCode(e) {
    e.preventDefault()
    setError(null)
    if (code.length !== 6) { setError('Enter the 6-digit code'); return }
    setLoading(true)
    const { needsPhone, error: err } = await signInWithEmailOtp(custEmail.trim(), code)
    setLoading(false)
    if (err) { setError(err); return }
    if (needsPhone) { setPhoneStep(true); return }
    router.push(custDestination)
  }

  async function handleSetPhone(e) {
    e.preventDefault()
    setError(null)
    const clean = phone.replace(/\s/g, '')
    if (!/^\+?[0-9]{8,15}$/.test(clean)) { setError('Enter a valid phone number (e.g. +97517123456)'); return }
    setLoading(true)
    const { success, error: err } = await setCustomerPhone(clean)
    setLoading(false)
    if (!success) { setError(err); return }
    router.push(custDestination)
  }

  function startOAuth(provider) {
    window.location.href = `/api/auth/oauth/${provider}?redirect=${encodeURIComponent(custDestination)}`
  }

  return (
    <div className="w-full max-w-sm mx-4">
      <div className="flex flex-col items-center mb-8">
        <Logo variant="stacked" className="h-28 w-auto mb-2" />
        <p className="text-sm text-muted-foreground mt-1">4K Edge-AI POS System</p>
      </div>

      <Card className="glassmorphism">
        <CardHeader>
          <CardTitle className="text-lg font-serif">Sign In</CardTitle>
          <CardDescription>{tab === 'staff' ? 'Staff & business accounts' : 'Shop as a customer'}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex rounded-lg bg-muted/50 p-1 mb-6">
            <button type="button" onClick={() => { setTab('staff'); setError(null) }}
              className={`flex-1 flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-all ${tab === 'staff' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              <KeyRound className="h-4 w-4" /> Staff
            </button>
            <button type="button" onClick={() => { setTab('customer'); setError(null) }}
              className={`flex-1 flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-all ${tab === 'customer' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              <Mail className="h-4 w-4" /> Customer
            </button>
          </div>

          {/* Staff: email + password */}
          {tab === 'staff' && (
            <form onSubmit={handleStaffSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Email</label>
                <Input type="email" placeholder="you@business.bt" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Password</label>
                <div className="relative">
                  <Input type={showPwd ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" className="pr-10" />
                  <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              {error && <div data-testid="login-error-alert" className="p-3 bg-tibetan/10 border border-tibetan/30 rounded-lg"><p className="text-xs text-tibetan">{error}</p></div>}
              <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90">
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in...</> : 'Sign In'}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Forgot your password? <a href="/login/reset" className="text-primary hover:underline underline-offset-4">Reset via email</a>
              </p>
            </form>
          )}

          {/* Customer: email OTP → phone */}
          {tab === 'customer' && !phoneStep && !otpSent && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={() => startOAuth('google')}>Google</Button>
                <Button type="button" variant="outline" onClick={() => startOAuth('facebook')}>Facebook</Button>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground"><div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" /></div>
              <form onSubmit={handleSendCode} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Email</label>
                  <Input type="email" placeholder="you@example.com" value={custEmail} onChange={e => setCustEmail(e.target.value)} autoFocus required />
                  <p className="text-xs text-muted-foreground">We'll email you a 6-digit code.</p>
                </div>
                {error && <div data-testid="login-error-alert" className="p-3 bg-tibetan/10 border border-tibetan/30 rounded-lg"><p className="text-xs text-tibetan">{error}</p></div>}
                <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90">
                  {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</> : 'Email me a code'}
                </Button>
              </form>
            </div>
          )}

          {tab === 'customer' && !phoneStep && otpSent && (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">Code sent to <span className="font-medium text-foreground">{custEmail}</span></p>
              {otpMessage && <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-center"><p className="text-sm font-medium text-emerald-600">{otpMessage}</p></div>}
              <div className="flex gap-2 justify-center" data-testid="otp-input-row">
                {[0, 1, 2, 3, 4, 5].map(i => (
                  <Input key={i} ref={el => codeInputs.current[i] = el} type="text" inputMode="numeric" maxLength={1}
                    value={code[i] ?? ''}
                    onChange={e => {
                      const v = e.target.value.replace(/\D/g, '')
                      const n = code.split(''); n[i] = v
                      const j = n.join('').slice(0, 6); setCode(j)
                      if (v && i < 5) codeInputs.current[i + 1]?.focus()
                    }}
                    onKeyDown={e => { if (e.key === 'Backspace' && !code[i] && i > 0) codeInputs.current[i - 1]?.focus() }}
                    onPaste={e => { e.preventDefault(); const p = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6); setCode(p); codeInputs.current[Math.min(p.length, 5)]?.focus() }}
                    className="w-11 h-12 text-center text-lg font-mono" autoFocus={i === 0} />
                ))}
              </div>
              {error && <div data-testid="login-error-alert" className="p-3 bg-tibetan/10 border border-tibetan/30 rounded-lg"><p className="text-xs text-tibetan">{error}</p></div>}
              <Button type="submit" disabled={loading || code.length !== 6} className="w-full bg-primary hover:bg-primary/90">
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying…</> : 'Verify & Continue'}
              </Button>
              <div className="flex items-center justify-between text-xs">
                <button type="button" onClick={() => { setOtpSent(false); setCode(''); setError(null) }} className="text-muted-foreground hover:text-foreground">Change email</button>
                <button type="button" onClick={otpTimer <= 0 ? handleSendCode : undefined} disabled={otpTimer > 0} className={otpTimer > 0 ? 'text-muted-foreground cursor-not-allowed' : 'text-primary hover:underline'}>
                  {otpTimer > 0 ? `Resend in ${otpTimer}s` : 'Resend code'}
                </button>
              </div>
            </form>
          )}

          {/* Phone capture (mandatory) */}
          {tab === 'customer' && phoneStep && (
            <form onSubmit={handleSetPhone} className="space-y-4">
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-foreground">One more step</p>
                <p className="text-xs text-muted-foreground">Add your phone number so shops can reach you about orders.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Phone number</label>
                <div className="relative">
                  <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input type="tel" placeholder="+975 17 123 456" value={phone} onChange={e => setPhone(e.target.value)} className="pl-9" autoFocus required />
                </div>
              </div>
              {error && <div data-testid="login-error-alert" className="p-3 bg-tibetan/10 border border-tibetan/30 rounded-lg"><p className="text-xs text-tibetan">{error}</p></div>}
              <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90">
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : 'Continue'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground mt-6">© 2026 Pelbu · GST 2026 Compliant</p>
      <div className="text-center text-xs text-muted-foreground mt-2 space-y-1">
        <p>New retailer? <a href="/signup/retailer" className="text-primary hover:underline underline-offset-4">Create a retail account</a></p>
        <p>Wholesaler? <a href="/signup/wholesaler" className="text-primary hover:underline underline-offset-4">Create a wholesale account</a></p>
      </div>
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
