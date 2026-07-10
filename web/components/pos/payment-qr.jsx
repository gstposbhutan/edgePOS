"use client"

import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { Loader2 } from "lucide-react"
import { buildNqrcPayload } from "@/lib/nqrc"

// Session cache of the caller's NQRC merchant config — the owner rarely changes it, so one fetch
// per session is plenty. `undefined` = not fetched yet; `null` = fetched, nothing configured.
let _configCache

async function loadConfig() {
  if (_configCache !== undefined) return _configCache
  try {
    const res = await fetch("/api/pos/nqrc")
    _configCache = res.ok ? ((await res.json()).nqrc ?? null) : null
  } catch {
    _configCache = null
  }
  return _configCache
}

/**
 * Dynamic Bhutan NQRC payment QR for the ONLINE method — shown before the journal-number step so the
 * customer scans it with their bank app (merchant + exact amount auto-filled). Renders nothing when
 * the vendor hasn't configured a merchant QR, so the cashier just takes the journal number as before.
 *
 * @param {{ amount: number, reference?: string }} props
 */
export function PaymentQr({ amount, reference }) {
  const [dataUrl, setDataUrl] = useState(null)
  const [state, setState] = useState("loading")   // loading | ready | unconfigured

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const cfg = await loadConfig()
      if (cancelled) return
      const payload = buildNqrcPayload(cfg, amount, { reference })
      if (!payload) { setState("unconfigured"); return }
      try {
        const url = await QRCode.toDataURL(payload, { margin: 1, width: 220, errorCorrectionLevel: "M" })
        if (!cancelled) { setDataUrl(url); setState("ready") }
      } catch {
        if (!cancelled) setState("unconfigured")
      }
    })()
    return () => { cancelled = true }
  }, [amount, reference])

  if (state === "unconfigured") return null   // no merchant QR set up → skip straight to journal entry

  return (
    <div className="flex flex-col items-center gap-2 rounded-lg bg-white p-3 border border-border">
      {state === "loading" ? (
        <div className="h-[220px] w-[220px] flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={dataUrl} alt="Scan to pay" width={220} height={220} />
      )}
      <p className="text-sm font-semibold text-slate-900">Scan to pay Nu. {parseFloat(amount).toFixed(2)}</p>
      <p className="text-[10px] text-slate-500">Bhutan QR — mBoB / BNB / any bank app</p>
    </div>
  )
}
