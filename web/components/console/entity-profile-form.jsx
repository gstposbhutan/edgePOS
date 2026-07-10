'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Save } from 'lucide-react'

/**
 * Business-profile editor backed by the role-agnostic /api/admin/settings endpoint, which
 * scopes reads and writes to the caller's own entity. Used by the distributor and wholesaler
 * consoles. Name / WhatsApp / TPN are the core business fields; the shop slug and marketplace
 * bio are optional and only matter for businesses that list a public storefront.
 */
export function EntityProfileForm() {
  const [form, setForm] = useState({
    name: '', whatsapp_no: '', tpn_gstin: '', shop_slug: '', marketplace_bio: '', delivery_mode: 'DELIVERY', email_notifications_enabled: false,
    nqrc_enabled: false, nqrc_merchant_name: '', nqrc_merchant_city: '', nqrc_account_id: '', nqrc_psp_guid: '', nqrc_mcc: '', nqrc_account_tag: '26',
  })
  const [isOwner, setIsOwner] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/admin/settings')
      const data = await res.json()
      if (data.entity) {
        setForm({
          name: data.entity.name || '',
          whatsapp_no: data.entity.whatsapp_no || '',
          tpn_gstin: data.entity.tpn_gstin || '',
          shop_slug: data.entity.shop_slug || '',
          marketplace_bio: data.entity.marketplace_bio || '',
          delivery_mode: data.entity.delivery_mode || 'DELIVERY',
          email_notifications_enabled: !!data.entity.email_notifications_enabled,
          nqrc_enabled: !!data.entity.nqrc_enabled,
          nqrc_merchant_name: data.entity.nqrc_merchant_name || '',
          nqrc_merchant_city: data.entity.nqrc_merchant_city || '',
          nqrc_account_id: data.entity.nqrc_account_id || '',
          nqrc_psp_guid: data.entity.nqrc_psp_guid || '',
          nqrc_mcc: data.entity.nqrc_mcc || '',
          nqrc_account_tag: data.entity.nqrc_account_tag || '26',
        })
      }
      setIsOwner(data.subRole === 'OWNER')
      setLoading(false)
    }
    load()
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
              <p className="text-xs text-muted-foreground">Primary channel for receipts and order alerts.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">TPN / GSTIN</label>
              <Input
                value={form.tpn_gstin}
                onChange={(e) => setForm(f => ({ ...f, tpn_gstin: e.target.value }))}
                placeholder="TPN0001234"
              />
              <p className="text-xs text-muted-foreground">Taxpayer number used on GST invoices.</p>
            </div>

            <div className="pt-2 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Marketplace (optional)</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Shop Slug</label>
              <Input
                value={form.shop_slug}
                onChange={(e) => setForm(f => ({ ...f, shop_slug: e.target.value }))}
                placeholder="my-store"
              />
              {form.shop_slug
                ? <p className="text-xs text-muted-foreground">Public store URL: /shop/{form.shop_slug}</p>
                : <p className="text-xs text-muted-foreground">Set a slug to publish a public storefront.</p>}
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

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Fulfilment</label>
              <select
                value={form.delivery_mode}
                onChange={(e) => setForm(f => ({ ...f, delivery_mode: e.target.value }))}
                className="flex w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="DELIVERY">Delivery — a rider is dispatched for each order</option>
                <option value="PICKUP">Pickup only — buyer collects, no rider (catalog-style)</option>
                <option value="NONE">Catalog only — no delivery arranged</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Choose <strong>Pickup only</strong> if you list items customers collect in person (e.g. used goods) — checkout skips the rider flow.
              </p>
            </div>

            {isOwner && (
              <div className="pt-3 border-t border-border space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Payment QR (Bhutan NQRC)</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Shown to customers at checkout to scan & pay. Owner-only — these are your bank/merchant details.</p>
                </div>

                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.nqrc_enabled}
                    onChange={(e) => setForm(f => ({ ...f, nqrc_enabled: e.target.checked }))}
                    className="h-4 w-4"
                  />
                  <span>Show a payment QR for online payments</span>
                </label>

                {form.nqrc_enabled && (
                  <div className="space-y-3 pl-1">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">Merchant name on QR</label>
                        <Input value={form.nqrc_merchant_name} onChange={(e) => setForm(f => ({ ...f, nqrc_merchant_name: e.target.value }))} placeholder={form.name || 'Business name'} />
                        <p className="text-xs text-muted-foreground">Defaults to your business name.</p>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">City</label>
                        <Input value={form.nqrc_merchant_city} onChange={(e) => setForm(f => ({ ...f, nqrc_merchant_city: e.target.value }))} placeholder="Thimphu" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">Merchant ID / account number</label>
                      <Input value={form.nqrc_account_id} onChange={(e) => setForm(f => ({ ...f, nqrc_account_id: e.target.value }))} placeholder="Registered with your bank" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">PSP / scheme GUID</label>
                        <Input value={form.nqrc_psp_guid} onChange={(e) => setForm(f => ({ ...f, nqrc_psp_guid: e.target.value }))} placeholder="From your bank / RMA" />
                        <p className="text-xs text-muted-foreground">Identifies the NQRC scheme on the Bhutan Financial Switch.</p>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">Merchant category (MCC)</label>
                        <Input value={form.nqrc_mcc} onChange={(e) => setForm(f => ({ ...f, nqrc_mcc: e.target.value }))} placeholder="e.g. 5411" />
                      </div>
                    </div>
                    <div className="space-y-1.5 max-w-[10rem]">
                      <label className="text-sm font-medium text-foreground">Account template tag</label>
                      <Input value={form.nqrc_account_tag} onChange={(e) => setForm(f => ({ ...f, nqrc_account_tag: e.target.value }))} placeholder="26" />
                      <p className="text-xs text-muted-foreground">EMVCo tag (26–51). Leave at 26 unless your bank says otherwise.</p>
                    </div>
                    <p className="text-xs text-muted-foreground">Get the PSP GUID, account number and tag from your bank&apos;s merchant onboarding. Amount, currency (BTN) and checksum are added automatically.</p>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-start gap-2 pt-2 border-t border-border">
              <input
                id="email_notifs"
                type="checkbox"
                checked={form.email_notifications_enabled}
                onChange={(e) => setForm(f => ({ ...f, email_notifications_enabled: e.target.checked }))}
                className="mt-1"
              />
              <label htmlFor="email_notifs" className="text-sm cursor-pointer">
                <span className="font-medium text-foreground">Email me notifications</span>
                <span className="block text-xs text-muted-foreground">Off by default — you always get them in-app (the bell). Turn on to also receive order &amp; low-stock alerts by email.</span>
              </label>
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
