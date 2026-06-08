"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, KeyRound, Trash2, Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getUser, getRoleClaims } from "@/lib/auth"

export default function TerminalTokensPage() {
  const router = useRouter()
  const [tokens, setTokens] = useState([])
  const [loading, setLoading] = useState(true)
  const [label, setLabel] = useState('')
  const [issuing, setIssuing] = useState(false)
  const [issued, setIssued] = useState(null)   // the one-time plaintext token
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function load() {
      const user = await getUser()
      if (!user) return router.push('/login')
      const { subRole } = getRoleClaims(user)
      if (!['MANAGER', 'OWNER', 'ADMIN'].includes(subRole)) {
        router.push('/pos')
        return
      }
      fetchTokens()
    }
    load()
  }, [])

  async function fetchTokens() {
    setLoading(true)
    const res = await fetch('/api/admin/terminal-tokens')
    const json = await res.json()
    setTokens(json.tokens || [])
    setLoading(false)
  }

  async function handleIssue() {
    setIssuing(true)
    setIssued(null)
    const res = await fetch('/api/admin/terminal-tokens', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: label.trim() || null }),
    })
    const json = await res.json()
    setIssuing(false)
    if (res.ok) {
      setIssued(json.token)   // shown ONCE
      setLabel('')
      fetchTokens()
    }
  }

  async function handleRevoke(id) {
    await fetch(`/api/admin/terminal-tokens/${id}`, { method: 'DELETE' })
    fetchTokens()
  }

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(issued)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable — the token is selectable in the code block
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="glassmorphism border-b border-border px-4 py-3 flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos/registers')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
            <button onClick={() => router.push('/pos')} className="hover:text-foreground transition-colors">POS</button>
            <span>/</span>
            <span className="text-foreground font-medium">Terminal Sync Tokens</span>
          </div>
          <p className="text-[10px] text-muted-foreground">{tokens.length} token{tokens.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-2xl w-full mx-auto">
        {/* Issue */}
        <div className="rounded-lg border border-border p-3 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <KeyRound className="h-4 w-4" /> Issue a terminal token
          </div>
          <p className="text-xs text-muted-foreground">
            Each POS terminal authenticates to cloud sync with its own token. It is shown
            once — copy it into the terminal&apos;s Settings → sync API key. Lost tokens are
            revoked and re-issued, never recovered.
          </p>
          <div className="flex gap-2">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Counter 1)" />
            <Button onClick={handleIssue} disabled={issuing}>{issuing ? 'Issuing…' : 'Issue'}</Button>
          </div>
          {issued && (
            <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 p-3 space-y-2">
              <p className="text-xs text-emerald-600 font-medium">New token — copy it now, it won&apos;t be shown again:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs break-all bg-background rounded px-2 py-1 border border-border">{issued}</code>
                <Button variant="outline" size="sm" onClick={copyToken}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* List */}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tokens issued yet.</p>
        ) : (
          <div className="rounded-lg border border-border divide-y divide-border">
            {tokens.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{t.label || 'Terminal token'}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {t.is_active ? 'Active' : 'Revoked'}
                    {t.last_seen_at ? ` · last seen ${new Date(t.last_seen_at).toLocaleString()}` : ' · never used'}
                  </p>
                </div>
                {t.is_active && (
                  <Button variant="ghost" size="icon-sm" onClick={() => handleRevoke(t.id)} title="Revoke">
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
