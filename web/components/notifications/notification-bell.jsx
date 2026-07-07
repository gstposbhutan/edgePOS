'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, Check } from 'lucide-react'

const TYPE_ICON = { ORDER: '🛒', LOW_STOCK: '⚠️', RECEIPT: '🧾', SYSTEM: '🔔' }

function timeAgo(ts) {
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

/** Bell + dropdown of the signed-in user's in-app notifications. Polls every 60s. */
export function NotificationBell({ className = '' }) {
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const d = await res.json()
      setItems(d.notifications || [])
      setUnread(d.unread || 0)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  async function markAll() {
    await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    setItems(prev => prev.map(n => ({ ...n, read: true })))
    setUnread(0)
  }

  async function openItem(n) {
    if (!n.read) {
      fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n.id }) }).catch(() => {})
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
      setUnread(u => Math.max(0, u - 1))
    }
    if (n.link) window.location.href = n.link
  }

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button onClick={() => { setOpen(o => !o); if (!open) load() }} className="relative p-2 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground" title="Notifications">
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-tibetan text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-background shadow-xl">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border sticky top-0 bg-background">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs text-primary hover:underline inline-flex items-center gap-1"><Check className="h-3 w-3" /> Mark all read</button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No notifications yet</p>
          ) : (
            items.map(n => (
              <button key={n.id} onClick={() => openItem(n)}
                className={`w-full text-left px-3 py-2.5 border-b border-border/60 hover:bg-muted/40 flex gap-2 ${n.read ? '' : 'bg-primary/5'}`}>
                <span className="text-base leading-none mt-0.5">{TYPE_ICON[n.type] || '🔔'}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">{n.title}</span>
                  {n.body && <span className="block text-xs text-muted-foreground whitespace-pre-line line-clamp-3">{n.body}</span>}
                  <span className="block text-[10px] text-muted-foreground mt-0.5">{timeAgo(n.created_at)}</span>
                </span>
                {!n.read && <span className="h-2 w-2 rounded-full bg-tibetan mt-1 shrink-0" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
