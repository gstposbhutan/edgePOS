'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Mail, MessageCircle, MapPin, Check, Loader2 } from 'lucide-react'

const CHANNELS = [
  { icon: Mail, title: 'Email', body: 'support@pelbu.com', href: 'mailto:support@pelbu.com' },
  { icon: MessageCircle, title: 'WhatsApp', body: 'Chat with our team', href: 'https://wa.me/97517000000' },
  { icon: MapPin, title: 'Bhutan', body: 'Thimphu, Bhutan', href: null },
]

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', org: '', message: '' })
  const [state, setState] = useState('idle') // idle | sending | sent | error
  const [error, setError] = useState(null)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setState('sending'); setError(null)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Something went wrong'); setState('error'); return }
      setState('sent')
    } catch {
      setError('Network error — please try again'); setState('error')
    }
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <div className="grid gap-12 lg:grid-cols-2">
        {/* Left: intro + channels */}
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-primary">Contact</span>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Let&apos;s talk</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Questions about Pelbu, or want a walkthrough for your business? Send us a note and we&apos;ll get back to you.
          </p>

          <div className="mt-8 space-y-3">
            {CHANNELS.map(({ icon: Icon, title, body, href }) => {
              const inner = (
                <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{title}</div>
                    <div className="text-sm text-muted-foreground">{body}</div>
                  </div>
                </div>
              )
              return href ? (
                <a key={title} href={href} target="_blank" rel="noreferrer" className="block transition-colors hover:[&>div]:border-primary/40">{inner}</a>
              ) : (
                <div key={title}>{inner}</div>
              )
            })}
          </div>
        </div>

        {/* Right: form */}
        <div className="rounded-3xl border border-border bg-card p-6 sm:p-8">
          {state === 'sent' ? (
            <div className="flex h-full flex-col items-center justify-center py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
                <Check className="h-7 w-7 text-emerald-600" />
              </div>
              <h2 className="mt-4 text-xl font-semibold">Message sent</h2>
              <p className="mt-2 max-w-xs text-sm text-muted-foreground">
                Thanks for reaching out — we&apos;ll be in touch at {form.email} soon.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <h2 className="text-xl font-semibold">Request a demo</h2>
              <div className="space-y-1">
                <label className="text-sm font-medium">Name</label>
                <Input value={form.name} onChange={set('name')} placeholder="Your name" required />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Email</label>
                <Input type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" required />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Business <span className="text-muted-foreground">(optional)</span></label>
                <Input value={form.org} onChange={set('org')} placeholder="Shop or company name" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Message</label>
                <textarea
                  value={form.message}
                  onChange={set('message')}
                  required
                  rows={4}
                  placeholder="Tell us about your business and what you’re looking for…"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" size="lg" className="w-full" disabled={state === 'sending'}>
                {state === 'sending' ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</> : 'Send message'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}
