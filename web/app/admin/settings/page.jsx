'use client'

import { useState, useEffect } from 'react'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Save } from 'lucide-react'

export default function SettingsPage() {
  const { user, loading: authLoading } = useAdminAuth()
  const [form, setForm] = useState({ name: '', whatsapp_no: '', tpn_gstin: '', shop_slug: '', marketplace_bio: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    async function loadSettings() {
      if (!user) return

      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const res = await fetch('/api/admin/settings', {
        headers: { authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()

      if (data.entity) {
        setForm({
          name: data.entity.name || '',
          whatsapp_no: data.entity.whatsapp_no || '',
          tpn_gstin: data.entity.tpn_gstin || '',
          shop_slug: data.entity.shop_slug || '',
          marketplace_bio: data.entity.marketplace_bio || '',
        })
      }
      setLoading(false)
    }

    loadSettings()
  }, [user])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(form),
    })

    const data = await res.json()

    if (res.ok) {
      setMessage({ type: 'success', text: 'Settings saved' })
    } else {
      setMessage({ type: 'error', text: data.error || 'Failed to save' })
    }

    setSaving(false)
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-serif font-bold text-foreground">Business Settings</h1>

      <Card className="glassmorphism">
        <CardHeader>
          <CardTitle className="text-lg font-serif">Business Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Business Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">WhatsApp Number</label>
              <Input
                type="tel"
                value={form.whatsapp_no}
                onChange={(e) => setForm(f => ({ ...f, whatsapp_no: e.target.value }))}
                placeholder="+97517123456"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">TPN / GSTIN</label>
              <Input
                value={form.tpn_gstin}
                onChange={(e) => setForm(f => ({ ...f, tpn_gstin: e.target.value }))}
                placeholder="TPN0001234"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Shop Slug (for marketplace URL)</label>
              <Input
                value={form.shop_slug}
                onChange={(e) => setForm(f => ({ ...f, shop_slug: e.target.value }))}
                placeholder="my-wholesale-store"
              />
              {form.shop_slug && (
                <p className="text-xs text-muted-foreground">Your store: https://innovates.bt/shop/{form.shop_slug}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Marketplace Bio</label>
              <textarea
                value={form.marketplace_bio}
                onChange={(e) => setForm(f => ({ ...f, marketplace_bio: e.target.value }))}
                rows={3}
                className="flex w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                placeholder="Tell customers about your business..."
              />
            </div>

            {message && (
              <div className={`p-3 rounded-lg text-xs ${
                message.type === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-500'
                  : 'bg-tibetan/10 border border-tibetan/30 text-tibetan'
              }`}>
                {message.text}
              </div>
            )}

            <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90">
              {saving
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                : <><Save className="mr-2 h-4 w-4" /> Save Changes</>
              }
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
