"use client"

import { Badge } from "@/components/ui/badge"

/**
 * GST-compliant receipt component.
 * Rendered to DOM for display AND captured by jsPDF for PDF export.
 * Matches Bhutan GST 2026 invoice format requirements.
 *
 * @param {{ order: object, entity: object, items: object[] }} props
 */
export function Receipt({ order, entity, items }) {
  const date = new Date(order.created_at).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
  const time = new Date(order.created_at).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <div id="receipt-content" className="bg-white text-gray-900 p-6 rounded-xl max-w-md w-full font-sans text-sm">
      {/* Header */}
      <div className="text-center border-b border-gray-200 pb-4 mb-4">
        <div className="text-2xl mb-1">🏔️</div>
        <h1 className="text-lg font-bold">{entity?.name ?? 'NEXUS BHUTAN'}</h1>
        {entity?.tpn_gstin && (
          <p className="text-xs text-gray-500 mt-0.5">TPN/GSTIN: {entity.tpn_gstin}</p>
        )}
        <p className="text-xs text-gray-400 mt-1">TAX INVOICE — GST 2026</p>
      </div>

      {/* Order meta */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-4">
        <div>
          <span className="text-gray-500">Invoice No:</span>
          <p className="font-semibold">{order.order_no}</p>
        </div>
        <div className="text-right">
          <span className="text-gray-500">Date & Time:</span>
          <p className="font-semibold">{date} {time}</p>
        </div>
        <div>
          <span className="text-gray-500">Payment:</span>
          <p className="font-semibold">{order.payment_method}</p>
        </div>
        <div className="text-right">
          <span className="text-gray-500">Customer:</span>
          <p className="font-semibold truncate">{order.buyer_whatsapp ?? 'Face-ID'}</p>
        </div>
      </div>

      {/* Line items */}
      <table className="w-full text-xs mb-4">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-1.5 text-gray-500 font-medium">Item</th>
            <th className="text-center py-1.5 text-gray-500 font-medium">Qty</th>
            <th className="text-right py-1.5 text-gray-500 font-medium">Rate</th>
            <th className="text-right py-1.5 text-gray-500 font-medium">GST</th>
            <th className="text-right py-1.5 text-gray-500 font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={item.id ?? i} className="border-b border-gray-100">
              <td className="py-1.5 pr-2">
                <p className="font-medium leading-tight">{item.name}</p>
                {item.sku && <p className="text-gray-400">{item.sku}</p>}
              </td>
              <td className="text-center py-1.5">{item.quantity}</td>
              <td className="text-right py-1.5">Nu.{parseFloat(item.unit_price).toFixed(2)}</td>
              <td className="text-right py-1.5">Nu.{parseFloat(item.gst_5).toFixed(2)}</td>
              <td className="text-right py-1.5 font-semibold">Nu.{parseFloat(item.total).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="space-y-1 text-xs border-t border-gray-200 pt-3 mb-4">
        <div className="flex justify-between text-gray-500">
          <span>Subtotal (excl. GST)</span>
          <span>Nu. {parseFloat(order.subtotal).toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-gray-500">
          <span>GST @ 5% (flat rate)</span>
          <span>Nu. {parseFloat(order.gst_total).toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-bold text-base border-t border-gray-300 pt-2 mt-2">
          <span>GRAND TOTAL</span>
          <span>Nu. {parseFloat(order.grand_total).toFixed(2)}</span>
        </div>
      </div>

      {/* Digital signature */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
        <p className="text-xs text-gray-500 mb-1">Digital Signature (SHA-256)</p>
        <p className="text-[10px] font-mono text-gray-600 break-all leading-relaxed">
          {order.digital_signature}
        </p>
      </div>

      {/* Footer */}
      <div className="text-center text-[10px] text-gray-400 border-t border-gray-200 pt-3 space-y-0.5">
        <p>This is a computer-generated invoice. No physical signature required.</p>
        <p>Compliant with Bhutan GST Act 2026 · Ministry of Finance</p>
        <p className="font-medium text-gray-500 mt-1">Thank you for your business!</p>
      </div>
    </div>
  )
}
