"use client"

import { useState, useEffect } from "react"
import { X, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const fmt = (n) => Number(n || 0).toLocaleString("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function bhutanToday() {
  return new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10)
}

function Stat({ label, value, tone = "default" }) {
  const color = tone === "pos" ? "text-emerald" : tone === "neg" ? "text-tibetan" : "text-foreground"
  return (
    <div className="flex items-center justify-between text-xs py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums font-medium ${color}`}>Nu. {fmt(value)}</span>
    </div>
  )
}

export function ZReportModal({ onClose }) {
  const [date, setDate] = useState(bhutanToday())
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!date) return
    setLoading(true)
    setError("")
    fetch(`/api/shifts/z-report?date=${encodeURIComponent(date)}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Failed to load")
        return data.report
      })
      .then(setReport)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [date])

  function handlePrint() {
    if (!report) return
    const w = window.open("", "_blank")
    if (!w) return
    const row = (l, v, cls = "") =>
      `<div class="row ${cls}"><span>${l}</span><span>Nu. ${fmt(v)}</span></div>`
    w.document.write(`<!doctype html><html><head><title>Z-Report ${report.date}</title>
      <style>
        body{font-family:sans-serif;padding:20px;max-width:400px;margin:0 auto}
        h1{text-align:center;font-size:18px;margin:0 0 4px}
        h2{text-align:center;font-size:13px;color:#666;margin:0 0 16px}
        .row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;font-size:13px}
        .total{font-weight:bold;border-top:2px solid #000;margin-top:8px;padding-top:8px}
        .section{margin-top:16px}
        .head{font-weight:bold;border-bottom:2px solid #000;padding-bottom:4px;margin-bottom:4px}
      </style></head><body>
      <h1>Z-REPORT</h1>
      <h2>${report.date}</h2>
      <div class="section">
        <div class="row"><span>Total Orders</span><span>${report.totalOrders}</span></div>
        <div class="row"><span>Cancelled</span><span>${report.totalCancelled}</span></div>
        <div class="row"><span>Refunded</span><span>${report.totalRefunded}</span></div>
      </div>
      <div class="section">
        <div class="head">Sales</div>
        ${row("Gross Sales", report.grossSales)}
        ${row("Subtotal", report.subtotal)}
        ${row("GST 5%", report.gstTotal)}
        ${row("Refunds", report.refundTotal)}
        ${row("Net Sales", report.netSales, "total")}
      </div>
      <div class="section">
        <div class="head">Payment Breakdown</div>
        ${row("Cash", report.cashSales)}
        ${row("Credit (Khata)", report.creditSales)}
        ${row("Digital", report.digitalSales)}
      </div>
      <script>window.print()</script>
      </body></html>`)
    w.document.close()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-xl shadow-lg w-full max-w-sm mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold">Z-Report</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="flex-1" />
            <Button variant="outline" size="sm" onClick={handlePrint} disabled={!report || loading}>
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
          </div>

          {loading && <div className="h-24 rounded-lg bg-muted animate-pulse" />}

          {error && <p className="text-xs text-tibetan">{error}</p>}

          {!loading && report && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-border p-2">
                  <div className="text-base font-bold tabular-nums">{report.totalOrders}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">Orders</div>
                </div>
                <div className="rounded-lg border border-border p-2">
                  <div className="text-base font-bold tabular-nums text-tibetan">{report.totalCancelled}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">Cancelled</div>
                </div>
                <div className="rounded-lg border border-border p-2">
                  <div className="text-base font-bold tabular-nums">{report.totalRefunded}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">Refunded</div>
                </div>
              </div>

              {/* Sales */}
              <div className="rounded-lg border border-border p-3">
                <div className="text-[10px] uppercase text-muted-foreground mb-1">Sales</div>
                <Stat label="Gross Sales" value={report.grossSales} />
                <Stat label="Subtotal" value={report.subtotal} />
                <Stat label="GST 5%" value={report.gstTotal} />
                <Stat label="Refunds" value={report.refundTotal} tone="neg" />
                <div className="border-t border-border my-1.5" />
                <Stat label="Net Sales" value={report.netSales} tone="pos" />
              </div>

              {/* Payment breakdown */}
              <div className="rounded-lg border border-border p-3">
                <div className="text-[10px] uppercase text-muted-foreground mb-1">Payment Breakdown</div>
                <Stat label="Cash" value={report.cashSales} />
                <Stat label="Credit (Khata)" value={report.creditSales} />
                <Stat label="Digital" value={report.digitalSales} />
              </div>
            </>
          )}
        </div>

        <div className="flex px-5 py-4 border-t border-border">
          <Button className="w-full" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}
