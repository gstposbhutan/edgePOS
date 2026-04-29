"use client"

import { useEffect, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { ShoppingBag, AlertTriangle } from "lucide-react"
import { CustomerPaymentUpload } from "@/components/shop/payment-upload"

export default function PaymentPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const orderId = params.orderId
  const token = searchParams.get('token')

  const [orderInfo, setOrderInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!orderId || !token) {
      setError('Invalid payment link')
      setLoading(false)
      return
    }

    async function validateLink() {
      try {
        const res = await fetch(`/api/shop/pay/${orderId}?token=${encodeURIComponent(token)}`)
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || 'Invalid payment link')
        } else {
          setOrderInfo(data)
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    validateLink()
  }, [orderId, token])

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Minimal header — no auth required */}
      <header className="border-b border-border px-4 py-3 flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
          <span className="text-sm">🏔️</span>
        </div>
        <span className="font-semibold text-sm">NEXUS BHUTAN</span>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-4 py-8">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center space-y-4 py-12">
            <div className="h-16 w-16 rounded-full bg-tibetan/10 flex items-center justify-center mx-auto">
              <AlertTriangle className="h-8 w-8 text-tibetan" />
            </div>
            <h2 className="text-lg font-semibold">Payment Link Invalid</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <h1 className="text-xl font-bold">Pay for Your Order</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Upload a screenshot of your mBoB or mPay payment to confirm.
            </p>
            <CustomerPaymentUpload
              orderId={orderId}
              token={token}
              orderInfo={orderInfo}
            />
          </div>
        )}
      </main>
    </div>
  )
}
