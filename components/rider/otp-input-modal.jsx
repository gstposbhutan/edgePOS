"use client"

import { useState, useRef, useEffect } from "react"
import { X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * 6-digit OTP input modal — shared for pickup and delivery confirmation.
 * @param {{ open, title, description, onConfirm, onClose, loading, error }} props
 */
export function OtpInputModal({ open, title, description, onConfirm, onClose, loading, error }) {
  const [otp, setOtp]     = useState('')
  const inputs            = useRef([])

  useEffect(() => {
    if (open) {
      setOtp('')
      setTimeout(() => inputs.current[0]?.focus(), 50)
    }
  }, [open])

  function handleChange(i, val) {
    const clean = val.replace(/\D/g, '')
    const arr   = otp.split('')
    arr[i]      = clean
    const joined = arr.join('').slice(0, 6)
    setOtp(joined)
    if (clean && i < 5) inputs.current[i + 1]?.focus()
  }

  function handleKeyDown(i, e) {
    if (e.key === 'Backspace' && !otp[i] && i > 0) {
      inputs.current[i - 1]?.focus()
    }
    if (e.key === 'Escape') onClose()
  }

  function handlePaste(e) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    setOtp(pasted)
    inputs.current[Math.min(pasted.length, 5)]?.focus()
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (otp.length === 6) onConfirm(otp)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-background rounded-t-2xl sm:rounded-2xl shadow-xl p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* OTP input grid */}
          <div className="flex gap-2 justify-center">
            {[0,1,2,3,4,5].map(i => (
              <input
                key={i}
                ref={el => inputs.current[i] = el}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={otp[i] ?? ''}
                onChange={e => handleChange(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                onPaste={handlePaste}
                className="w-12 h-14 text-center text-2xl font-mono font-bold border-2 border-input rounded-xl bg-background focus:border-primary focus:outline-none transition-colors"
              />
            ))}
          </div>

          {error && (
            <div className="p-3 bg-tibetan/10 border border-tibetan/30 rounded-lg">
              <p className="text-sm text-tibetan text-center">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            disabled={otp.length !== 6 || loading}
            className="w-full h-12 text-base"
          >
            {loading
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying...</>
              : 'Confirm'
            }
          </Button>
        </form>
      </div>
    </div>
  )
}
