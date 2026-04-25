"use client"

import { useEffect, useState, useRef } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { CheckCircle, Download, MessageCircle, ShoppingCart, Loader2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Receipt } from "@/components/pos/receipt"
import { createClient } from "@/lib/supabase/client"
import { getUser, getRoleClaims } from "@/lib/auth"

export default function OrderConfirmationPage() {
  const { id }       = useParams()
  const router       = useRouter()
  const searchParams = useSearchParams()
  const isSuccess    = searchParams.get('success') === 'true'

  const supabase     = createClient()
  const receiptRef   = useRef(null)

  const [order,      setOrder]      = useState(null)
  const [items,      setItems]      = useState([])
  const [entity,     setEntity]     = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [waLoading,  setWaLoading]  = useState(false)
  const [waSent,     setWaSent]     = useState(false)

  useEffect(() => {
    loadOrder()
  }, [id])

  async function loadOrder() {
    setLoading(true)

    const [{ data: orderData }, currentUser] = await Promise.all([
      supabase
        .from('orders')
        .select('*')
        .eq('id', id)
        .single(),
      getUser(),
    ])

    if (!orderData) {
      setLoading(false)
      return
    }

    setOrder(orderData)

    // Load order items
    const { data: orderItems } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', id)
      .eq('status', 'ACTIVE')

    setItems(orderItems ?? [])

    // Load entity
    if (currentUser) {
      const { entityId } = getRoleClaims(currentUser)
      const { data: entityData } = await supabase
        .from('entities')
        .select('id, name, tpn_gstin, whatsapp_no')
        .eq('id', entityId)
        .single()
      setEntity(entityData)
    }

    setLoading(false)
  }

  async function handleDownloadPdf() {
    if (!receiptRef.current) return
    setPdfLoading(true)

    try {
      const { default: jsPDF }      = await import('jspdf')
      const { default: html2canvas } = await import('html2canvas')

      const canvas = await html2canvas(receiptRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      })

      const imgData  = canvas.toDataURL('image/png')
      const pdf      = new jsPDF('p', 'mm', 'a5')
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
      pdf.save(`${order.order_no}.pdf`)
    } catch (err) {
      console.error('PDF generation failed:', err)
    } finally {
      setPdfLoading(false)
    }
  }

  async function handleSendWhatsApp() {
    setWaLoading(true)
    try {
      // Try gateway service first
      const gatewayUrl = process.env.NEXT_PUBLIC_WHATSAPP_GATEWAY_URL || 'http://localhost:3001'
      const res = await fetch(`${gatewayUrl}/api/send-receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: order.buyer_whatsapp,
          invoiceId: order.id,
          orderNo: order.order_no,
          entityName: entity?.name,
          grandTotal: order.grand_total,
          gstTotal: order.gst_total,
        }),
      })

      const data = await res.json()
      if (data.success) {
        setWaSent(true)
        // Update local order status
        setOrder(prev => ({ ...prev, whatsapp_status: 'SENT' }))
      } else {
        // Fallback to WhatsApp Web
        fallbackWhatsAppWeb()
      }
    } catch {
      // Gateway not reachable — fallback to WhatsApp Web
      fallbackWhatsAppWeb()
    } finally {
      setWaLoading(false)
    }
  }

  function fallbackWhatsAppWeb() {
    const phone   = order?.buyer_whatsapp?.replace('+', '') ?? ''
    const message = encodeURIComponent(
      `Your receipt from ${entity?.name ?? 'NEXUS BHUTAN'}\n` +
      `Invoice: ${order?.order_no}\n` +
      `Total: Nu. ${parseFloat(order?.grand_total ?? 0).toFixed(2)}\n` +
      `GST (5%): Nu. ${parseFloat(order?.gst_total ?? 0).toFixed(2)}\n\n` +
      `Thank you for your purchase!`
    )
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank')
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-tibetan" />
        <p className="text-muted-foreground">Order not found</p>
        <Button onClick={() => router.push('/pos')} className="bg-primary hover:bg-primary/90">
          Back to POS
        </Button>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">

        {/* Success banner */}
        {isSuccess && (
          <div className="flex flex-col items-center gap-3 text-center py-4">
            <div className="h-16 w-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-emerald-500" />
            </div>
            <div>
              <h1 className="text-xl font-serif font-bold text-foreground">Sale Complete</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Order <span className="font-mono font-medium">{order.order_no}</span> confirmed
              </p>
            </div>
            <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
              ✓ Stock updated · GST recorded · Signature verified
            </Badge>
          </div>
        )}

        {/* Action buttons */}
        <div className="grid grid-cols-3 gap-3">
          <Button
            onClick={handleDownloadPdf}
            disabled={pdfLoading}
            variant="outline"
            className="flex flex-col gap-1.5 h-auto py-3 border-border"
          >
            {pdfLoading
              ? <Loader2 className="h-5 w-5 animate-spin" />
              : <Download className="h-5 w-5" />
            }
            <span className="text-xs">Download PDF</span>
          </Button>

          <Button
            onClick={handleSendWhatsApp}
            disabled={waLoading || waSent || !order.buyer_whatsapp}
            variant="outline"
            className={`flex flex-col gap-1.5 h-auto py-3 ${
              waSent ? 'border-emerald-500/50 text-emerald-600 bg-emerald-500/5' :
              'border-emerald-500/50 text-emerald-600 hover:bg-emerald-500/5'
            }`}
            title={!order.buyer_whatsapp ? 'No WhatsApp number on file' : waSent ? 'Receipt sent' : ''}
          >
            {waLoading
              ? <Loader2 className="h-5 w-5 animate-spin" />
              : waSent
                ? <CheckCircle className="h-5 w-5" />
                : <MessageCircle className="h-5 w-5" />
            }
            <span className="text-xs">{waSent ? 'Sent' : 'WhatsApp'}</span>
          </Button>

          <Button
            onClick={() => router.push('/pos')}
            className="flex flex-col gap-1.5 h-auto py-3 bg-primary hover:bg-primary/90"
          >
            <ShoppingCart className="h-5 w-5" />
            <span className="text-xs">New Sale</span>
          </Button>
        </div>

        {/* Receipt */}
        <div ref={receiptRef} className="shadow-lg rounded-xl overflow-hidden">
          <Receipt order={order} entity={entity} items={items} />
        </div>

      </div>
    </div>
  )
}
