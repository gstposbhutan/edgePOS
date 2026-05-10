"use client"

import { useState, useRef, useEffect } from "react"
import { Phone, MessageCircle, Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

/**
 * Customer WhatsApp OTP verification modal — required for CREDIT payment.
 * Sends an OTP to the customer's WhatsApp and verifies it before checkout proceeds.
 * The customer does NOT get logged in — this is identity verification only.
 * The verified phone is passed back to the POS via onVerified(phone).
 *
 * @param {{ open: boolean, onVerified: (phone: string) => void, onClose: () => void }} props
 */
export function CustomerOtpModal({ open, onVerified, onClose }) {
  const [step,       setStep]       = useState('phone') // 'phone' | 'otp'
  const [phone,      setPhone]      = useState('')
  const [otp,        setOtp]        = useState('')
  const [otpTimer,   setOtpTimer]   = useState(0)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const [otpMessage, setOtpMessage] = useState(null)
  const otpInputs = useRef([])

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep('phone'); setPhone(''); setOtp('')
      setOtpTimer(0); setError(null); setOtpMessage(null)
    }
  }, [open])

  // OTP countdown
  useEffect(() => {
    if (otpTimer <= 0) return
    const tick = setTimeout(() => setOtpTimer(t => t - 1), 1000)
    return () => clearTimeout(tick)
  }, [otpTimer])

  async function handleSendOtp(e) {
    e?.preventDefault()
    setError(null)
    const cleaned = phone.replace(/\s/g, '')
    if (!/^\+?[0-9]{8,15}$/.test(cleaned)) {
      setError('Enter a valid WhatsApp number (e.g. +97517123456)')
      return
    }
    const normalised = cleaned.startsWith('+') ? cleaned : `+${cleaned}`
    setLoading(true)
    const res = await fetch('/api/auth/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: normalised }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error); return }
    setStep('otp')
    setOtpTimer(60)
    if (data.mock || data.dev) {
      setOtp(data.otp)
      setOtpMessage(`Demo OTP: ${data.otp}`)
    } else {
      setOtpMessage(null)
    }
  }

  async function handleVerifyOtp(e) {
    e?.preventDefault()
    if (otp.length !== 6) { setError('Enter the 6-digit code'); return }
    setLoading(true)
    setError(null)
    const normalised = phone.replace(/\s/g, '')
    const normPhone  = normalised.startsWith('+') ? normalised : `+${normalised}`

    // We only need to verify the OTP — we don't need a full session for the customer.
    // Call the verify endpoint in check-only mode using the mock/OTP path.
    const res = await fetch('/api/auth/whatsapp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: normPhone, otp }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok || !data.success) {
      setError(data.error || 'Invalid OTP. Please try again.')
      return
    }
    // OTP verified — pass phone back to POS, don't navigate
    onVerified(normPhone)
  }

  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Verify Customer Identity
          </DialogTitle>
          <DialogDescription>
            Credit payment requires customer WhatsApp verification. A one-time code will be sent to the customer's phone.
          </DialogDescription>
        </DialogHeader>

        {step === 'phone' && (
          <form onSubmit={handleSendOtp} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Customer WhatsApp Number</label>
              <div className="relative">
                <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="tel"
                  placeholder="+975 17 123 456"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="pl-9"
                  autoFocus
                  required
                />
              </div>
            </div>
            {error && <p className="text-xs text-tibetan">{error}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
              <Button type="submit" disabled={loading} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                {loading
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</>
                  : <><MessageCircle className="mr-2 h-4 w-4" /> Send OTP</>
                }
              </Button>
            </div>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp} className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              Code sent to <span className="font-medium text-foreground">{phone}</span>
            </p>

            {otpMessage && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-center">
                <p className="text-sm font-medium text-emerald-600">{otpMessage}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-center block">Enter 6-digit code</label>
              <div className="flex gap-2 justify-center">
                {[0,1,2,3,4,5].map(i => (
                  <Input
                    key={i}
                    ref={el => otpInputs.current[i] = el}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={otp[i] ?? ''}
                    onChange={e => {
                      const val = e.target.value.replace(/\D/g, '')
                      const arr = otp.split('')
                      arr[i] = val
                      const joined = arr.join('').slice(0, 6)
                      setOtp(joined)
                      if (val && i < 5) otpInputs.current[i + 1]?.focus()
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Backspace' && !otp[i] && i > 0) otpInputs.current[i - 1]?.focus()
                    }}
                    onPaste={e => {
                      e.preventDefault()
                      const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
                      setOtp(pasted)
                      otpInputs.current[Math.min(pasted.length, 5)]?.focus()
                    }}
                    className="w-11 h-12 text-center text-lg font-mono"
                    autoFocus={i === 0}
                  />
                ))}
              </div>
            </div>

            {error && <p className="text-xs text-tibetan text-center">{error}</p>}

            <Button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="w-full bg-primary hover:bg-primary/90"
            >
              {loading
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying...</>
                : 'Verify & Proceed to Checkout'
              }
            </Button>

            <div className="flex items-center justify-between text-xs">
              <button type="button" onClick={() => { setStep('phone'); setOtp(''); setError(null) }}
                className="text-muted-foreground hover:text-foreground">
                Change number
              </button>
              <button
                type="button"
                disabled={otpTimer > 0}
                onClick={otpTimer <= 0 ? handleSendOtp : undefined}
                className={otpTimer > 0 ? 'text-muted-foreground cursor-not-allowed' : 'text-primary hover:underline'}
              >
                {otpTimer > 0 ? `Resend in ${otpTimer}s` : 'Resend code'}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
