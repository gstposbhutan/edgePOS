"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, KeyRound, Trash2, Download, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getUser } from "@/lib/auth"

export default function LicensesPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [licenses, setLicenses] = useState([])
  const [entities, setEntities] = useState([])
  const [requests, setRequests] = useState([])   // pending terminal self-registrations
  const [issuing, setIssuing] = useState(false)
  const [issued, setIssued] = useState(null)   // { license, filename } — shown once
  // form
  const [entityId, setEntityId] = useState("")
  const [machineId, setMachineId] = useState("")
  const [tier, setTier] = useState("STANDARD")
  const [mode, setMode] = useState("POS")   // terminal mode: POS (cash sales) vs BACK_OFFICE (stock only)
  const [days, setDays] = useState("365")
  const [label, setLabel] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    async function load() {
      const user = await getUser()
      if (!user) return router.push("/login")
      const res = await fetch("/api/admin/licenses")
      if (!res.ok) { router.push("/pos"); return }   // API enforces super-admin → redirect non-admins
      const json = await res.json()
      setLicenses(json.licenses || [])
      setEntities(json.entities || [])
      setRequests(json.requests || [])
      setReady(true)
    }
    load()
  }, [])

  async function refresh() {
    const res = await fetch("/api/admin/licenses")
    if (res.ok) { const j = await res.json(); setLicenses(j.licenses || []); setRequests(j.requests || []) }
  }

  function downloadLic(license, filename) {
    const blob = new Blob([license], { type: "application/octet-stream" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  async function handleIssue() {
    setError(""); setIssued(null)
    if (!entityId || !machineId.trim()) { setError("Store and Machine ID are required."); return }
    setIssuing(true)
    const res = await fetch("/api/admin/licenses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entity_id: entityId, machine_id: machineId.trim(), tier, mode, days: Number(days) || 365, label: label.trim() || null }),
    })
    const json = await res.json()
    setIssuing(false)
    if (!res.ok) { setError(json.error || "Failed to issue license"); return }
    setIssued({ license: json.license, filename: json.filename })
    downloadLic(json.license, json.filename)   // auto-download the .lic
    setMachineId(""); setLabel("")
    refresh()
  }

  async function handleRevoke(id) {
    await fetch(`/api/admin/licenses/${id}`, { method: "DELETE" })
    refresh()
  }

  const entityName = (id) => entities.find((e) => e.id === id)?.name || id?.slice(0, 8)

  if (!ready) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>

  return (
    <div className="flex flex-col h-full">
      <div className="glassmorphism border-b border-border px-4 py-3 flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={() => router.push("/pos")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
            <button onClick={() => router.push("/pos")} className="hover:text-foreground transition-colors">POS</button>
            <span>/</span><span className="text-foreground font-medium">Desktop Licenses</span>
          </div>
          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Super-admin · {licenses.length} issued</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-2xl w-full mx-auto">
        {/* Pending terminal self-registrations — machine_id captured on first start */}
        {requests.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
            <p className="text-sm font-medium">Pending terminals ({requests.length})</p>
            <p className="text-xs text-muted-foreground">New POS terminals that registered their Machine ID on first start. Click &ldquo;Use&rdquo; to pre-fill the issue form — no manual typing.</p>
            <div className="divide-y divide-border">
              {requests.map((r) => (
                <div key={r.id} className="flex items-center gap-2 py-1.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono break-all">{r.machine_id}</p>
                    <p className="text-[10px] text-muted-foreground">{r.hostname || "—"}{r.app_version ? ` · v${r.app_version}` : ""} · {new Date(r.requested_at).toLocaleString()}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => { setMachineId(r.machine_id); if (typeof window !== "undefined") window.scrollTo({ top: 0 }) }}>Use</Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Issue */}
        <div className="rounded-lg border border-border p-3 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium"><KeyRound className="h-4 w-4" /> Issue a desktop license (.lic)</div>
          <p className="text-xs text-muted-foreground">
            Machine-locked + signed. Pick the store and use the <b>Machine ID</b> from the pending
            terminal (or the terminal&apos;s activation screen). The issued <code>.lic</code> activates AND
            provisions the terminal (store + sync token + the cloud address, filled in automatically) —
            it&apos;s shown once.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <select value={entityId} onChange={(e) => setEntityId(e.target.value)} className="col-span-2 h-9 rounded-md border border-border bg-background px-2 text-sm">
              <option value="">— Select retail store —</option>
              {entities.map((e) => <option key={e.id} value={e.id}>{e.name}{e.tpn_gstin ? ` (${e.tpn_gstin})` : ""}</option>)}
            </select>
            <Input value={machineId} onChange={(e) => setMachineId(e.target.value)} placeholder="Machine ID (Windows MachineGuid)" className="col-span-2" />
            <select value={mode} onChange={(e) => setMode(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm" title="Terminal mode">
              <option value="POS">POS terminal (cash sales)</option>
              <option value="BACK_OFFICE">Back office (stock only)</option>
            </select>
            <select value={tier} onChange={(e) => setTier(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
              <option value="STANDARD">STANDARD</option><option value="TRIAL">TRIAL</option><option value="ENTERPRISE">ENTERPRISE</option>
            </select>
            <Input type="number" value={days} onChange={(e) => setDays(e.target.value)} min="1" placeholder="Valid days" className="col-span-2" />
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" className="col-span-2" />
          </div>
          {error && <p className="text-xs text-tibetan">{error}</p>}
          <Button onClick={handleIssue} disabled={issuing}>{issuing ? "Issuing…" : "Issue & download .lic"}</Button>
          {issued && (
            <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 p-3 space-y-2">
              <p className="text-xs text-emerald-600 font-medium">Issued <code>{issued.filename}</code> — downloaded. It embeds a sync token and won&apos;t be shown again.</p>
              <Button variant="outline" size="sm" onClick={() => downloadLic(issued.license, issued.filename)}>
                <Download className="h-4 w-4 mr-1" /> Download again
              </Button>
            </div>
          )}
        </div>

        {/* List */}
        {licenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No licenses issued yet.</p>
        ) : (
          <div className="rounded-lg border border-border divide-y divide-border">
            {licenses.map((l) => (
              <div key={l.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{entityName(l.entity_id)} <span className="text-[10px] text-muted-foreground">· {l.tier}</span></p>
                  <p className="text-[11px] text-muted-foreground break-all">
                    {l.register?.name ? `${l.register.name} · ` : ""}{l.register?.mode === "BACK_OFFICE" ? "back office" : "POS"} · machine {l.machine_id?.slice(0, 16)} · {l.is_active ? "active" : "revoked"} · expires {new Date(l.expires_at).toLocaleDateString()}
                  </p>
                </div>
                {l.is_active && (
                  <Button variant="ghost" size="icon-sm" onClick={() => handleRevoke(l.id)} title="Revoke">
                    <Trash2 className="h-4 w-4 text-tibetan" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
