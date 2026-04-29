"use client"

import { useState, useRef } from "react"
import { Upload, CheckCircle, XCircle, Loader2, ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

const MAX_ATTEMPTS = 3

export function CustomerPaymentUpload({ orderId, token, orderInfo }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [state, setState] = useState('idle') // idle | verifying | success | failed
  const [attempts, setAttempts] = useState(0)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  function handleFileSelect(e) {
    const selected = e.target.files?.[0]
    if (!selected) return
    setFile(selected)
    setPreview(URL.createObjectURL(selected))
    setResult(null)
    setError(null)
    setState('idle')
  }

  async function handleSubmit() {
    if (!file || state === 'verifying') return

    setState('verifying')
    setError(null)

    try {
      const imageBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const base64 = reader.result.split(',')[1]
          resolve(base64)
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const res = await fetch(`/api/shop/pay/${orderId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, imageBase64, mimeType: file.type || 'image/jpeg' }),
      })

      const data = await res.json()
      const newAttempts = attempts + 1
      setAttempts(newAttempts)

      if (!res.ok) {
        setError(data.error || 'Verification failed')
        setState('failed')
        return
      }

      if (data.success) {
        setResult(data)
        setState('success')
      } else {
        setResult(data)
        setState('failed')
      }
    } catch (err) {
      setError(err.message)
      setState('failed')
    }
  }

  const attemptsLeft = result?.attemptsLeft ?? (MAX_ATTEMPTS - attempts)
  const maxReached = attempts >= MAX_ATTEMPTS && state !== 'success'

  if (state === 'success') {
    return (
      <div className="text-center space-y-4 py-8">
        <div className="h-20 w-20 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
          <CheckCircle className="h-10 w-10 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-emerald-700">Payment Verified!</h2>
          <p className="text-muted-foreground mt-1">Your order {result?.order_no} is now complete.</p>
          {result?.referenceNo && (
            <p className="text-sm text-muted-foreground mt-1">Reference: {result.referenceNo}</p>
          )}
        </div>
        <p className="text-sm text-muted-foreground">You'll receive a receipt on WhatsApp shortly.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Order summary */}
      {orderInfo && (
        <div className="p-4 bg-muted/30 rounded-xl space-y-1">
          <p className="text-sm font-medium">{orderInfo.order_no}</p>
          <p className="text-sm text-muted-foreground">From {orderInfo.seller_name}</p>
          <p className="text-lg font-bold text-primary">Nu. {parseFloat(orderInfo.grand_total).toFixed(2)}</p>
        </div>
      )}

      {/* File upload area */}
      <div
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
        />

        {preview ? (
          <div className="space-y-3">
            <img src={preview} alt="Payment screenshot" className="max-h-48 mx-auto rounded-lg object-contain" />
            <p className="text-xs text-muted-foreground">Tap to change screenshot</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto">
              <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-sm font-medium">Tap to upload payment screenshot</p>
              <p className="text-xs text-muted-foreground mt-1">Opens camera or gallery</p>
            </div>
          </div>
        )}
      </div>

      {/* Error message */}
      {state === 'failed' && (
        <div className="p-3 bg-tibetan/10 border border-tibetan/30 rounded-xl space-y-1">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-tibetan shrink-0" />
            <p className="text-sm font-medium text-tibetan">
              {result?.reason || error || 'Verification failed'}
            </p>
          </div>
          {attemptsLeft > 0 && !maxReached && (
            <p className="text-xs text-tibetan/70 pl-6">
              {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining
            </p>
          )}
          {maxReached && (
            <p className="text-xs text-tibetan/70 pl-6">
              Maximum attempts reached. Please contact the store for assistance.
            </p>
          )}
        </div>
      )}

      {/* Submit button */}
      {!maxReached && (
        <Button
          onClick={handleSubmit}
          disabled={!file || state === 'verifying'}
          className="w-full h-12 text-base"
          size="lg"
        >
          {state === 'verifying' ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying payment...</>
          ) : (
            <><Upload className="mr-2 h-4 w-4" /> Submit Payment Screenshot</>
          )}
        </Button>
      )}

      <p className="text-xs text-center text-muted-foreground">
        Take a screenshot of your mBoB or mPay payment confirmation and upload it here.
      </p>
    </div>
  )
}
