"use client"

import { useState, useEffect, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, RefreshCw, CheckCircle, Printer, Loader2, Building2, Calendar, ChevronDown, ChevronUp, X, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ShortcutBar } from "@/components/pos/keyboard/shortcut-bar"
import { usePurchases } from "@/hooks/use-purchases"
import { getUser, getRoleClaims } from "@/lib/auth"

const STATUS_COLORS = {
  DRAFT:               'bg-muted text-muted-foreground',
  SENT:                'bg-blue-500/10 text-blue-600',
  PARTIALLY_RECEIVED:  'bg-amber-500/10 text-amber-600',
  CONFIRMED:           'bg-emerald-500/10 text-emerald-600',
  PAID:                'bg-emerald-600/10 text-emerald-700',
  CANCELLED:           'bg-tibetan/10 text-tibetan',
}

export default function PurchaseDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { detail, loading, error, fetchDetail, updateStatus, convertToInvoice, confirmInvoice } = usePurchases()

  const [converting,    setConverting]    = useState(false)
  const [confirming,    setConfirming]    = useState(false)
  const [convertLines,  setConvertLines]  = useState([])
  const [showConvert,   setShowConvert]   = useState(false)
  const [actionError,   setActionError]   = useState(null)
  const [confirmed,     setConfirmed]     = useState(null)
  const [payMethod,     setPayMethod]     = useState('CREDIT')
  const [suppRef,       setSuppRef]       = useState('')
  const [selectedLine,  setSelectedLine]  = useState(0)
  const printRef = useRef(null)

  useEffect(() => {
    getUser().then(user => {
      if (!user) return router.push('/login')
      const { subRole } = getRoleClaims(user)
      if (subRole === 'CASHIER') return router.push('/pos')
    })
  }, [])

  useEffect(() => { if (params.id) fetchDetail(params.id) }, [params.id])

  // Global keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
      if (inInput) return
      if (e.key === 'Escape') { e.preventDefault(); router.push('/pos/purchases'); return }
      if (e.key === 'F5')     { e.preventDefault(); fetchDetail(params.id); return }
      const orderType   = detail?.order?.order_type
      const orderStatus = detail?.order?.status
      if (e.key === 'F3' && orderType === 'PURCHASE_ORDER' && !['CANCELLED','CONFIRMED'].includes(orderStatus)) {
        e.preventDefault(); setShowConvert(v => !v); return
      }
      if (e.key === 'F4' && orderType === 'PURCHASE_INVOICE' && orderStatus === 'DRAFT') {
        e.preventDefault(); handleConfirm(); return
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [detail])

  // Init convert lines when items load
  useEffect(() => {
    if (detail?.items && detail.order?.order_type === 'PURCHASE_ORDER') {
      setConvertLines(detail.items.map(item => ({
        order_item_id:    item.id,
        product_name:     item.name,
        original_quantity: item.quantity,
        sub_batches: [{
          quantity:        item.quantity,
          unit_cost:       item.unit_cost || item.unit_price || '',
          mrp:             '',
          selling_price:   '',
          batch_number:    '',
          batch_barcode:   '',
          expires_at:      '',
          manufactured_at: '',
        }],
      })))
      setPayMethod(detail.order.payment_method || 'CREDIT')
    }
  }, [detail?.items])

  async function handleMarkSent() {
    setActionError(null)
    try { await updateStatus(params.id, 'SENT'); fetchDetail(params.id) }
    catch (err) { setActionError(err.message) }
  }

  async function handleCancel() {
    if (!confirm('Cancel this purchase order?')) return
    setActionError(null)
    try { await updateStatus(params.id, 'CANCELLED'); fetchDetail(params.id) }
    catch (err) { setActionError(err.message) }
  }

  async function handleConvert(e) {
    e.preventDefault()
    setConverting(true); setActionError(null)
    try {
      const invoice = await convertToInvoice(params.id, {
        items: convertLines.map(l => ({
          order_item_id: l.order_item_id,
          sub_batches: l.sub_batches.map(sb => ({
            quantity:        parseInt(sb.quantity, 10) || 1,
            unit_cost:       sb.unit_cost     ? parseFloat(sb.unit_cost)     : undefined,
            mrp:             sb.mrp           ? parseFloat(sb.mrp)           : undefined,
            selling_price:   sb.selling_price ? parseFloat(sb.selling_price) : undefined,
            batch_number:    sb.batch_number    || undefined,
            batch_barcode:   sb.batch_barcode   || undefined,
            expires_at:      sb.expires_at      || undefined,
            manufactured_at: sb.manufactured_at || undefined,
          })),
        })),
        payment_method: payMethod,
        supplier_ref:   suppRef || undefined,
      })
      router.push(`/pos/purchases/${invoice.id}`)
    } catch (err) {
      setActionError(err.message)
    } finally {
      setConverting(false)
    }
  }

  async function handleConfirm() {
    if (!confirm('Confirm receipt? This will create stock batches and update inventory.')) return
    setConfirming(true); setActionError(null)
    try {
      const result = await confirmInvoice(params.id)
      setConfirmed(result)
      fetchDetail(params.id)
    } catch (err) {
      setActionError(err.message)
    } finally {
      setConfirming(false)
    }
  }

  async function handlePrint() {
    if (!printRef.current) return
    try {
      const { default: jsPDF }       = await import('jspdf')
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(printRef.current, { scale: 2, backgroundColor: '#fff', useCORS: true })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a5')
      const w = pdf.internal.pageSize.getWidth()
      pdf.addImage(imgData, 'PNG', 0, 0, w, (canvas.height * w) / canvas.width)
      pdf.save(`${detail.order.order_no}.pdf`)
    } catch (err) { console.error('PDF error:', err) }
  }

  if (loading && !detail) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
  }

  if (!detail?.order) {
    return <div className="flex-1 flex flex-col items-center justify-center gap-4">
      <p className="text-muted-foreground">Purchase order not found</p>
      <Button onClick={() => router.push('/pos/purchases')} variant="outline">Back to Purchases</Button>
    </div>
  }

  const { order, items, timeline } = detail
  const relatedInvoices = detail?.relatedInvoices || []
  const isPO      = order.order_type === 'PURCHASE_ORDER'
  const isInvoice = order.order_type === 'PURCHASE_INVOICE'
  const supplierName = order.seller?.name || order.supplier_name || 'Unknown Supplier'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="glassmorphism border-b border-border px-4 py-3 flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos/purchases')}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
            <button onClick={() => router.push('/pos')} className="hover:text-foreground transition-colors">POS</button>
            <span>/</span>
            <button onClick={() => router.push('/pos/purchases')} className="hover:text-foreground transition-colors">Purchases</button>
            <span>/</span>
            <span className="text-foreground font-mono font-medium truncate">{order.order_no}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_COLORS[order.status] || 'bg-muted'}`}>{order.status}</span>
            <span className="text-[10px] text-muted-foreground">{isPO ? 'Purchase Order' : 'Purchase Invoice'}</span>
            <span className="text-[10px] text-muted-foreground">{new Date(order.created_at).toLocaleString()}</span>
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => fetchDetail(params.id)} title="Refresh [F5]"><RefreshCw className="h-4 w-4" /></Button>
        {isInvoice && order.status === 'CONFIRMED' && (
          <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
            <Printer className="h-4 w-4" /> Print
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
      <div className="p-4 space-y-4 max-w-3xl mx-auto w-full">
        {actionError && <div className="p-3 bg-tibetan/10 border border-tibetan/30 rounded-lg text-sm text-tibetan">{actionError}</div>}

        {/* Confirmed success banner */}
        {confirmed && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-1">
            <div className="flex items-center gap-2 text-emerald-700 font-semibold"><CheckCircle className="h-5 w-5" /> Goods Received & Stock Updated</div>
            <p className="text-sm text-emerald-600">{confirmed.batches_created} batch{confirmed.batches_created !== 1 ? 'es' : ''} created</p>
            {confirmed.batches?.map(b => (
              <p key={b.id} className="text-xs text-emerald-600/80">· {b.products?.name} — Batch {b.batch_number}</p>
            ))}
          </div>
        )}

        {/* Supplier + order info */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 border border-border rounded-xl space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Supplier</p>
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <p className="font-medium">{supplierName}</p>
            </div>
            {order.seller?.whatsapp_no && <p className="text-xs text-muted-foreground pl-6">{order.seller.whatsapp_no}</p>}
            {order.supplier_ref && <p className="text-xs text-muted-foreground pl-6">Ref: {order.supplier_ref}</p>}
          </div>
          <div className="p-3 border border-border rounded-xl space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Details</p>
            <p className="text-sm"><span className="text-muted-foreground">Payment:</span> <strong>{order.payment_method}</strong></p>
            {order.expected_delivery && (
              <p className="text-sm flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Expected:</span> {new Date(order.expected_delivery).toLocaleDateString()}
              </p>
            )}
            {order.received_at && <p className="text-xs text-emerald-600">Received: {new Date(order.received_at).toLocaleString()}</p>}
            {isInvoice && order.purchase_order_id && (
              <button onClick={() => router.push(`/pos/purchases/${order.purchase_order_id}`)} className="text-xs text-primary hover:underline">
                View original PO →
              </button>
            )}
          </div>
        </div>

        {/* Line items */}
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/20 border-b border-border">
            <p className="text-sm font-semibold">Items ({items.length})</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground bg-muted/10">
                <th className="text-left px-4 py-2">Product</th>
                <th className="text-right px-4 py-2">Qty</th>
                <th className="text-right px-4 py-2">Unit Cost</th>
                <th className="text-right px-4 py-2">Total</th>
                {isInvoice && <th className="text-left px-4 py-2">Batch</th>}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{item.quantity}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    Nu. {parseFloat(item.unit_cost || item.unit_price || 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-primary">
                    Nu. {parseFloat(item.total || 0).toFixed(2)}
                  </td>
                  {isInvoice && (
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {item.batch_number && <p>#{item.batch_number}</p>}
                      {item.expires_at && <p>Exp: {new Date(item.expires_at).toLocaleDateString()}</p>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2.5 bg-muted/10 border-t border-border flex justify-end">
            <p className="text-base font-bold text-primary">Total: Nu. {parseFloat(order.grand_total).toFixed(2)}</p>
          </div>
        </div>

        {/* Related invoices */}
        {isPO && relatedInvoices.length > 0 && (
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/20 border-b border-border">
              <p className="text-sm font-semibold">Related Invoices ({relatedInvoices.length})</p>
            </div>
            <div className="divide-y divide-border">
              {relatedInvoices.map(inv => (
                <button key={inv.id} onClick={() => router.push(`/pos/purchases/${inv.id}`)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-muted/30 transition-colors">
                  <div>
                    <p className="text-sm font-mono font-medium">{inv.order_no}</p>
                    <p className="text-xs text-muted-foreground">{new Date(inv.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_COLORS[inv.status] || 'bg-muted'}`}>{inv.status}</span>
                    <p className="text-sm font-semibold text-primary mt-0.5">Nu. {parseFloat(inv.grand_total).toFixed(2)}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Fully received banner */}
        {isPO && order.status === 'CONFIRMED' && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-sm text-emerald-700 font-medium">
            <CheckCircle className="h-4 w-4 shrink-0" />
            All items fully invoiced — Purchase Order complete.
          </div>
        )}

        {/* Actions */}
        {isPO && !['CANCELLED', 'CONFIRMED'].includes(order.status) && (
          <div className="space-y-3">
            <Button onClick={() => setShowConvert(true)} className="w-full gap-2">
              <Plus className="h-4 w-4" /> Convert to Purchase Invoice [F3]
            </Button>
            {order.status === 'DRAFT' && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleMarkSent} className="flex-1 border-blue-500/30 text-blue-600 hover:bg-blue-500/5">
                  Mark as Sent to Supplier
                </Button>
                <Button variant="outline" onClick={handleCancel} className="flex-1 border-tibetan/30 text-tibetan hover:bg-tibetan/5">
                  Cancel PO
                </Button>
              </div>
            )}
          </div>
        )}

        {isInvoice && order.status === 'DRAFT' && (
          <Button onClick={handleConfirm} disabled={confirming} className="w-full h-12 text-base bg-emerald-600 hover:bg-emerald-700">
            {confirming ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Confirming Receipt...</> : <>
              <CheckCircle className="mr-2 h-5 w-5" /> Confirm Receipt — Create Stock Batches
            </>}
          </Button>
        )}

        {/* Status timeline */}
        {timeline?.length > 0 && (
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/20 border-b border-border">
              <p className="text-sm font-semibold">Status History</p>
            </div>
            <div className="p-4 space-y-2">
              {timeline.map(entry => (
                <div key={entry.id} className="flex items-center gap-3 text-xs">
                  <span className="text-muted-foreground">{new Date(entry.created_at).toLocaleString()}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-medium">{entry.to_status}</span>
                  {entry.reason && <span className="text-muted-foreground">({entry.reason})</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Shortcut bar */}
      <ShortcutBar shortcuts={isPO ? [
        { key: 'F3',  label: showConvert ? 'Close form' : 'Create Invoice' },
        { key: 'F5',  label: 'Refresh' },
        { key: 'Esc', label: 'Back' },
      ] : isInvoice ? [
        { key: 'F4',  label: detail?.order?.status === 'DRAFT' ? 'Confirm Receipt' : '' },
        { key: 'F5',  label: 'Refresh' },
        { key: 'Esc', label: 'Back' },
      ].filter(s => s.label) : [
        { key: 'F5',  label: 'Refresh' },
        { key: 'Esc', label: 'Back' },
      ]} />

      {/* Full-screen Convert to Invoice overlay */}
      {showConvert && isPO && (
        <PurchaseInvoiceOverlay
          order={order}
          items={items}
          convertLines={convertLines}
          setConvertLines={setConvertLines}
          payMethod={payMethod}
          setPayMethod={setPayMethod}
          suppRef={suppRef}
          setSuppRef={setSuppRef}
          converting={converting}
          actionError={actionError}
          selectedLine={selectedLine}
          setSelectedLine={setSelectedLine}
          onSubmit={handleConvert}
          onClose={() => { setShowConvert(false); setActionError(null) }}
        />
      )}

      {/* Hidden print area for invoice */}
      {isInvoice && order.status === 'CONFIRMED' && (
        <div className="hidden">
          <div ref={printRef} className="bg-white p-6 max-w-md font-sans text-sm" style={{ color: '#000' }}>
            <div className="text-center mb-4">
              <p className="text-lg font-bold">PURCHASE INVOICE</p>
              <p className="text-xs text-gray-500">Bhutan GST 2026</p>
            </div>
            <div className="mb-3 space-y-0.5">
              <p><strong>Invoice No:</strong> {order.order_no}</p>
              <p><strong>Supplier:</strong> {supplierName}</p>
              {order.supplier_ref && <p><strong>Supplier Ref:</strong> {order.supplier_ref}</p>}
              <p><strong>Date:</strong> {new Date(order.received_at || order.created_at).toLocaleDateString()}</p>
              <p><strong>Payment:</strong> {order.payment_method}</p>
            </div>
            <table className="w-full border-collapse text-xs mb-3">
              <thead><tr className="border-b border-gray-300">
                <th className="text-left py-1">Product</th><th className="text-right py-1">Qty</th>
                <th className="text-right py-1">Cost</th><th className="text-right py-1">Total</th>
              </tr></thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="py-1">{item.name}{item.batch_number ? ` (Batch ${item.batch_number})` : ''}</td>
                    <td className="py-1 text-right">{item.quantity}</td>
                    <td className="py-1 text-right">Nu. {parseFloat(item.unit_cost||item.unit_price||0).toFixed(2)}</td>
                    <td className="py-1 text-right">Nu. {parseFloat(item.total||0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-right font-bold">Total: Nu. {parseFloat(order.grand_total).toFixed(2)}</div>
            <p className="text-center text-xs text-gray-400 mt-4">Computer-generated · Bhutan GST Act 2026</p>
          </div>
        </div>
      )}
    </div>
  )
}

function PurchaseInvoiceOverlay({
  order, items, convertLines, setConvertLines,
  payMethod, setPayMethod, suppRef, setSuppRef,
  converting, actionError, selectedLine, setSelectedLine,
  onSubmit, onClose,
}) {
  useEffect(() => {
    function onKey(e) {
      const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
      if (e.key === 'Escape' && !inInput) { e.preventDefault(); onClose(); return }
      if (e.key === 'F5') { e.preventDefault(); onSubmit(e); return }
      if (e.key === 'ArrowDown' && !inInput) {
        e.preventDefault()
        setSelectedLine(r => convertLines.length > 0 ? (r + 1) % convertLines.length : 0)
      }
      if (e.key === 'ArrowUp' && !inInput) {
        e.preventDefault()
        setSelectedLine(r => convertLines.length > 0 ? (r - 1 + convertLines.length) % convertLines.length : 0)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [convertLines, onSubmit, onClose])

  const allQtyMatch = convertLines.every(l =>
    l.sub_batches.reduce((s, sb) => s + (parseInt(sb.quantity, 10) || 0), 0) === l.original_quantity
  )
  const canSubmit = !converting && allQtyMatch

  const grandTotal = convertLines.reduce((sum, l) =>
    sum + l.sub_batches.reduce((s, sb) =>
      s + (parseFloat(sb.unit_cost) || 0) * (parseInt(sb.quantity, 10) || 0), 0
    ), 0
  )

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background select-none">
      {/* Header */}
      <header className="glassmorphism border-b border-border px-4 py-2 flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
            <span>Purchases</span>
            <span>/</span>
            <span className="font-mono">{order.order_no}</span>
            <span>/</span>
            <span className="text-foreground font-medium">Convert to Invoice</span>
          </div>
          <p className="text-[10px] text-muted-foreground">{convertLines.length} line{convertLines.length !== 1 ? 's' : ''}</p>
        </div>
        {grandTotal > 0 && (
          <span className="text-sm font-bold text-primary tabular-nums shrink-0">
            Nu. {grandTotal.toFixed(2)}
          </span>
        )}
        <Button variant="ghost" size="icon-sm" onClick={onClose}><X className="h-4 w-4" /></Button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <div className="w-64 shrink-0 border-r border-border flex flex-col p-4 gap-3 overflow-y-auto">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Invoice Details</p>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Payment Method</label>
            <select value={payMethod} onChange={e => setPayMethod(e.target.value)}
              className="w-full h-8 px-2 text-sm border border-input rounded bg-background">
              {['ONLINE','CASH','CREDIT'].map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Supplier Invoice Ref</label>
            <input value={suppRef} onChange={e => setSuppRef(e.target.value)}
              placeholder="e.g. INV-888"
              className="w-full h-8 px-2 text-sm border border-input rounded bg-background" />
          </div>

          <div className="border-t border-border pt-3 space-y-1">
            <p className="font-semibold text-foreground text-[10px] uppercase tracking-wide mb-2">Lines</p>
            {convertLines.map((l, i) => {
              const qty = l.sub_batches.reduce((s, sb) => s + (parseInt(sb.quantity, 10) || 0), 0)
              const ok = qty === l.original_quantity
              const origItem = items.find(it => it.id === l.order_item_id)
              return (
                <button key={l.order_item_id} onClick={() => setSelectedLine(i)}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-left transition-colors ${
                    selectedLine === i ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'
                  }`}>
                  <span className="text-xs truncate max-w-[130px]">{origItem?.name ?? l.product_name}</span>
                  <span className={`text-[10px] font-mono font-bold ${ok ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {qty}/{l.original_quantity}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="mt-auto border-t border-border pt-3 space-y-1">
            {[['↑↓','Navigate lines'],['F5','Create invoice'],['Esc','Cancel']].map(([k,v]) => (
              <div key={k} className="flex items-center gap-2 py-0.5">
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-muted border border-border rounded min-w-[36px] text-center">{k}</span>
                <span className="text-[10px] text-muted-foreground">{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel — lines */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {convertLines.map((line, lineIdx) => {
              const isSelected = selectedLine === lineIdx
              const origItem = items.find(i => i.id === line.order_item_id)
              const totalReceived = line.sub_batches.reduce((s, sb) => s + (parseInt(sb.quantity, 10) || 0), 0)
              const mismatch = totalReceived !== line.original_quantity

              function updateSB(sbIdx, field, value) {
                setConvertLines(prev => prev.map((l, li) => li !== lineIdx ? l : {
                  ...l, sub_batches: l.sub_batches.map((sb, si) => si !== sbIdx ? sb : { ...sb, [field]: value })
                }))
              }
              function addSB() {
                setConvertLines(prev => prev.map((l, li) => li !== lineIdx ? l : {
                  ...l, sub_batches: [...l.sub_batches, {
                    quantity: '', unit_cost: l.sub_batches[0]?.unit_cost || '',
                    mrp: '', selling_price: '', batch_number: '', batch_barcode: '', expires_at: '', manufactured_at: ''
                  }]
                }))
              }
              function removeSB(sbIdx) {
                setConvertLines(prev => prev.map((l, li) => li !== lineIdx ? l : {
                  ...l, sub_batches: l.sub_batches.filter((_, si) => si !== sbIdx)
                }))
              }

              return (
                <div key={line.order_item_id}
                  onClick={() => setSelectedLine(lineIdx)}
                  className={`border-b border-border transition-colors ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/20'}`}>
                  {/* Line header */}
                  <div className={`flex items-center justify-between px-4 py-2.5 border-l-2 ${isSelected ? 'border-primary' : 'border-transparent'}`}>
                    <div className="flex items-center gap-2">
                      {isSelected && <span className="text-primary text-xs">►</span>}
                      <p className="text-sm font-medium">{origItem?.name}</p>
                      <span className="text-xs text-muted-foreground font-mono">{origItem?.sku}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-semibold tabular-nums ${mismatch ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {totalReceived} / {line.original_quantity} units
                      </span>
                      <button type="button" onClick={e => { e.stopPropagation(); addSB() }}
                        className="text-xs text-primary hover:underline font-medium px-2 py-0.5 rounded border border-primary/30 hover:bg-primary/5">
                        + Batch
                      </button>
                    </div>
                  </div>

                  {/* Sub-batch rows */}
                  <div className="px-4 pb-3 space-y-2">
                    {line.sub_batches.map((sb, sbIdx) => (
                      <div key={sbIdx} className="grid grid-cols-12 gap-2 items-end" onClick={e => e.stopPropagation()}>
                        <div className="col-span-2">
                          {sbIdx === 0 && <label className="text-[10px] text-muted-foreground block mb-0.5">Qty</label>}
                          <input type="number" min="1" value={sb.quantity}
                            onChange={e => updateSB(sbIdx, 'quantity', e.target.value)}
                            className="w-full h-8 px-2 text-sm border border-input rounded bg-background" />
                        </div>
                        <div className="col-span-2">
                          {sbIdx === 0 && <label className="text-[10px] text-muted-foreground block mb-0.5">Unit Cost</label>}
                          <input type="number" step="0.01" value={sb.unit_cost} placeholder="0.00"
                            onChange={e => updateSB(sbIdx, 'unit_cost', e.target.value)}
                            className="w-full h-8 px-2 text-sm border border-input rounded bg-background" />
                        </div>
                        <div className="col-span-2">
                          {sbIdx === 0 && <label className="text-[10px] text-muted-foreground block mb-0.5">MRP</label>}
                          <input type="number" step="0.01" value={sb.mrp} placeholder="0.00"
                            onChange={e => updateSB(sbIdx, 'mrp', e.target.value)}
                            className="w-full h-8 px-2 text-sm border border-input rounded bg-background" />
                        </div>
                        <div className="col-span-2">
                          {sbIdx === 0 && <label className="text-[10px] text-muted-foreground block mb-0.5">Sell Price</label>}
                          <input type="number" step="0.01" value={sb.selling_price} placeholder="0.00"
                            onChange={e => updateSB(sbIdx, 'selling_price', e.target.value)}
                            className="w-full h-8 px-2 text-sm border border-input rounded bg-background" />
                        </div>
                        <div className="col-span-2">
                          {sbIdx === 0 && <label className="text-[10px] text-muted-foreground block mb-0.5">Batch #</label>}
                          <input value={sb.batch_number} placeholder="Optional"
                            onChange={e => updateSB(sbIdx, 'batch_number', e.target.value)}
                            className="w-full h-8 px-2 text-sm border border-input rounded bg-background" />
                        </div>
                        <div className="col-span-1">
                          {sbIdx === 0 && <label className="text-[10px] text-muted-foreground block mb-0.5">Expiry</label>}
                          <input type="date" value={sb.expires_at}
                            onChange={e => updateSB(sbIdx, 'expires_at', e.target.value)}
                            className="w-full h-8 px-2 text-xs border border-input rounded bg-background" />
                        </div>
                        <div className="col-span-1 flex items-end pb-0.5">
                          {line.sub_batches.length > 1 && (
                            <button type="button" onClick={() => removeSB(sbIdx)}
                              className="text-muted-foreground hover:text-tibetan transition-colors">
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-4 py-3 space-y-2 shrink-0 bg-muted/10">
            {actionError && <p className="text-xs text-tibetan bg-tibetan/10 px-3 py-2 rounded">{actionError}</p>}
            {!allQtyMatch && <p className="text-xs text-amber-600">⚠ Batch quantities must match ordered quantities.</p>}
            <div className="flex items-center justify-between gap-4">
              {grandTotal > 0 && (
                <span className="text-sm tabular-nums text-muted-foreground">
                  Total (ex-GST) <strong className="text-primary">Nu. {grandTotal.toFixed(2)}</strong>
                </span>
              )}
              <Button onClick={onSubmit} disabled={!canSubmit} className="h-10 px-8 shrink-0 ml-auto">
                {converting
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</>
                  : 'Create Purchase Invoice [F5]'}
              </Button>
            </div>
          </div>

          <ShortcutBar shortcuts={[
            { key: '↑↓',  label: 'Navigate lines' },
            { key: 'F5',  label: 'Create invoice' },
            { key: 'Esc', label: 'Cancel' },
          ]} />
        </div>
      </div>
    </div>
  )
}
