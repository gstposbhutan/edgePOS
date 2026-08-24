"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { getUser, getRoleClaims } from "@/lib/auth"
import { OfficeShell } from "@/components/pos/office/office-shell"
import { OfficeForm, OfficeSection, OfficeField } from "@/components/pos/office/office-form"
import { ProductForm } from "@/components/pos/products/product-form"
import { MASTER_KEYS, withHandlers } from "@/lib/pos/office-keys"

// The product card (spec WF-09) — the whole record on one sheet.
//
// This is the screen the demo spends the most time on, and the reason is the density: an owner
// checking a rate, a tax code or a pack size sees all three at once instead of paging a wizard.
// So it READS as a sheet — two columns, sections as landmarks, label left and value right.
//
// Editing still goes through ProductForm. That modal already owns validation, the HSN picker, the
// pack/case ladder guard and the save call; rebuilding any of it inline would mean two ways to
// write a product and only one of them tested. E opens it, and the sheet reloads after a save.
const money = (v) => (v == null || v === '' ? null : Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const yesNo = (v) => (v ? 'Yes' : 'No')

export default function ProductCardPage() {
  const router = useRouter()
  const { id } = useParams()

  const [authed, setAuthed] = useState(false)
  const [canManage, setCanManage] = useState(false)
  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function guard() {
      const user = await getUser()
      if (!user) return router.push('/login')
      const { subRole } = getRoleClaims(user)
      setCanManage(['MANAGER', 'OWNER', 'ADMIN'].includes(subRole))
      setAuthed(true)
    }
    guard()
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/products/catalog/${id}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed to load product')
      setProduct(d.product)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [id])
  useEffect(() => { if (authed) load() }, [authed, load])

  async function handleSave(formData) {
    setSaving(true)
    try {
      const res = await fetch(`/api/products/catalog/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ formData }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) return { error: d.error || 'Save failed' }
      setEditing(false)
      await load()
      return { error: null }
    } finally { setSaving(false) }
  }

  const p = product
  const ladder = [
    p?.pack_size ? `${p.pack_label || 'Pack'} of ${p.pack_size}` : null,
    p?.case_size ? `${p.case_label || 'Case'} of ${p.case_size}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <OfficeShell
      crumb="Master Data Management"
      title={p ? `Product — ${p.name}` : 'Product'}
      keys={[
        ...(canManage ? [{ key: 'E', label: 'Edit', onClick: () => setEditing(true) }] : []),
        { key: 'L', label: 'List', onClick: () => router.push('/pos/products') },
        ...withHandlers(MASTER_KEYS, { P: () => window.print() }).filter(k => k.key === 'Esc'),
      ]}
    >
      {error && <p className="mb-2 text-[12px] text-red-700">{error}</p>}

      {loading ? (
        <p className="text-[12px] opacity-60 p-4">Loading…</p>
      ) : !p ? (
        <p className="text-[12px] opacity-60 p-4">Product not found.</p>
      ) : (
        <OfficeForm>
          <div>
            <OfficeSection title="Product">
              <OfficeField label="Product Name" value={p.name} />
              <OfficeField label="Print Name" value={p.name} />
              <OfficeField label="Code / SKU" value={p.sku} lookup />
              <OfficeField label="Barcode" value={p.barcode} lookup />
              <OfficeField label="HSN Code" value={p.hsn_code} lookup />
            </OfficeSection>

            <OfficeSection title="Brand and Grouping">
              <OfficeField label="Brand" value={p.brand} lookup />
              <OfficeField label="Group" value={p.category} lookup />
              <OfficeField label="Sub Group" value={p.subcategory} lookup />
              <OfficeField label="Condition" value={p.condition} />
            </OfficeSection>

            <OfficeSection title="Tax">
              <OfficeField label="GST Exempt" value={yesNo(p.gst_exempt)} />
              <OfficeField label="Tax at Sale" value={p.gst_exempt ? 'Exempt' : 'Output 5% GST'} />
            </OfficeSection>

            <OfficeSection title="Stock">
              <OfficeField label="Stock Unit" value={p.unit} lookup />
              <OfficeField label="Current Stock" value={p.current_stock ?? 0} />
              <OfficeField label="Reorder Point" value={p.reorder_point} />
              <OfficeField label="Rotation" value={p.stock_rotation || 'FIFO'} />
              <OfficeField label="Sold by Weight" value={yesNo(p.sold_by_weight)} />
            </OfficeSection>
          </div>

          <div>
            <OfficeSection title="Pricing">
              <OfficeField label="MRP" value={money(p.mrp)} />
              <OfficeField label="Selling Price" value={money(p.selling_price)} />
              <OfficeField label="Wholesale Price" value={money(p.wholesale_price)} />
              <OfficeField label="Cost Price" value={money(p.cost_price)} />
            </OfficeSection>

            <OfficeSection title="Unit Ladder">
              <OfficeField label="Pack / Case" value={ladder || null} />
              <OfficeField label="Pack Size" value={p.pack_size} />
              <OfficeField label="Case Size" value={p.case_size} />
            </OfficeSection>

            <OfficeSection title="Others">
              <OfficeField label="Active" value={yesNo(p.is_active)} />
              <OfficeField label="Package Only" value={yesNo(p.sold_as_package_only)} />
              <OfficeField label="Product Type" value={p.product_type} />
              <OfficeField label="Visible on Web" value={yesNo(p.visible_on_web)} />
            </OfficeSection>

            {p.description && (
              <OfficeSection title="Description">
                <p className="text-[12px] leading-relaxed">{p.description}</p>
              </OfficeSection>
            )}
          </div>
        </OfficeForm>
      )}

      <p className="mt-2 text-[10px] opacity-60">
        E edits this product, L returns to the register. Amounts in Nu.
      </p>

      <ProductForm
        open={editing}
        product={p}
        categories={[]}
        saving={saving}
        onSave={(formData) => handleSave(formData)}
        onClose={() => setEditing(false)}
      />
    </OfficeShell>
  )
}
