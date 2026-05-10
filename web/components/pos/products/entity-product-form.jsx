'use client'

import { useState, useEffect } from 'react'
import { X, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import EntityProductSpecifications from './entity-product-specifications'
import { useEntityProductSpecifications } from '@/hooks/use-entity-product-specifications'
import HsnCodeSelector from './hsn-code-selector'

/**
 * Form for vendors to add/edit their products
 *
 * This form includes:
 * - Standard fields (SKU, display name, pricing, inventory, manufacturer details, batch/expiry)
 * - Dynamic specifications based on the master product's category
 *
 * Props:
 * - masterProduct: The master product (name, category, etc.)
 * - entityProduct: Existing vendor product (for editing)
 * - onSave: Callback when form is submitted
 * - onCancel: Callback when form is cancelled
 */
export default function EntityProductForm({
  masterProduct,
  entityProduct = null,
  onSave,
  onCancel,
}) {
  const isEditing = !!entityProduct
  const categoryId = masterProduct?.categories?.[0]?.id || null

  // Form state for standard fields
  const [formData, setFormData] = useState({
    // Basic
    hsn_code: '',
    sku: '',
    display_name: masterProduct?.name || '',
    barcode: '',
    qr_code: '',

    // Pricing
    wholesale_price: '',
    mrp: '',

    // Inventory
    current_stock: '0',
    reorder_point: '10',
    is_active: true,

    // Manufacturer Details
    manufacturer_name: '',
    manufacturer_brand: '',
    country_of_origin: '',

    // Batch & Expiry
    batch_number: '',
    manufactured_on: '',
    expiry_date: '',
    best_before: '',

    // Notes
    vendor_notes: '',
  })

  // Specification values state
  const [specifications, setSpecifications] = useState({})
  const [inheritedCategory, setInheritedCategory] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Load existing data if editing
  useEffect(() => {
    if (entityProduct) {
      setFormData({
        hsn_code: entityProduct.hsn_code || '',
        sku: entityProduct.sku || '',
        display_name: entityProduct.display_name || masterProduct?.name || '',
        barcode: entityProduct.barcode || '',
        qr_code: entityProduct.qr_code || '',
        wholesale_price: entityProduct.wholesale_price?.toString() || '',
        mrp: entityProduct.mrp?.toString() || '',
        current_stock: entityProduct.current_stock?.toString() || '0',
        reorder_point: entityProduct.reorder_point?.toString() || '10',
        is_active: entityProduct.is_active ?? true,
        manufacturer_name: entityProduct.manufacturer_name || '',
        manufacturer_brand: entityProduct.manufacturer_brand || '',
        country_of_origin: entityProduct.country_of_origin || '',
        batch_number: entityProduct.batch_number || '',
        manufactured_on: entityProduct.manufactured_on || '',
        expiry_date: entityProduct.expiry_date || '',
        best_before: entityProduct.best_before || '',
        vendor_notes: entityProduct.vendor_notes || '',
      })

      // Load specifications if editing
      if (entityProduct.id) {
        loadSpecifications(entityProduct.id, entityProduct.hsn_code)
      }
    }
  }, [entityProduct])

  async function loadSpecifications(entityProductId, hsnCode) {
    const { fetchSpecifications } = useEntityProductSpecifications(entityProductId)
    await fetchSpecifications()
    // Set inherited category from HSN code
    if (hsnCode) {
      try {
        const res = await fetch('/api/hsn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codes: [hsnCode] })
        })
        const data = await res.json()
        if (data.hsn_codes?.[0]) {
          const hsn = data.hsn_codes[0]
          setInheritedCategory({
            category: hsn.category,
            subcategory: hsn.short_description
          })
        }
      } catch (err) {
        console.error('Error fetching HSN details:', err)
      }
    }
  }

  function handleInputChange(e) {
    const { name, value, type, checked } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      // Validate required fields
      if (!formData.sku) {
        throw new Error('SKU is required')
      }

      // Prepare the data
      const productData = {
        ...formData,
        // Include inherited category from HSN
        hsn_code: formData.hsn_code || null,
        category: inheritedCategory?.category || null,
        subcategory: inheritedCategory?.subcategory || null,
        wholesale_price: formData.wholesale_price ? parseFloat(formData.wholesale_price) : null,
        mrp: formData.mrp ? parseFloat(formData.mrp) : null,
        current_stock: parseInt(formData.current_stock) || 0,
        reorder_point: parseInt(formData.reorder_point) || 0,
      }

      // Convert empty strings to null for optional fields
      const optionalFields = [
        'barcode', 'qr_code', 'manufacturer_name', 'manufacturer_brand',
        'country_of_origin', 'batch_number', 'manufactured_on', 'expiry_date',
        'best_before', 'vendor_notes'
      ]

      optionalFields.forEach((field) => {
        if (!productData[field]) {
          productData[field] = null
        }
      })

      // Call save callback
      if (onSave) {
        const savedProduct = await onSave(productData)

        // Save specifications if we have a product ID and HSN code
        if (savedProduct?.id && formData.hsn_code && Object.keys(specifications).length > 0) {
          await saveSpecificationsForProduct(savedProduct.id)
        }
      }
    } catch (err) {
      console.error('[EntityProductForm] Submit error:', err)
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function saveSpecificationsForProduct(entityProductId) {
    const token = await getToken()

    // Convert specifications object to array format
    const specsArray = Object.entries(specifications).map(([propertyId, value]) => ({
      property_id: propertyId,
      value: value,
    }))

    const res = await fetch(`/api/admin/entity-products/${entityProductId}/specifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ specifications: specsArray }),
    })

    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.error || 'Failed to save specifications')
    }

    return data.specifications
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{isEditing ? 'Edit Product' : 'Add Product'}</h2>
            <p className="text-sm text-muted-foreground">
              Master Product: {masterProduct?.name}
            </p>
          </div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-500">
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">
          {/* Section 1: Basic Information */}
          <section>
            <h3 className="font-semibold mb-4 text-sm">Basic Information</h3>

            {/* HSN Code Selector with Category Inheritance */}
            <div className="mb-6">
              <HsnCodeSelector
                value={formData.hsn_code}
                onChange={(code) => {
                  setFormData({ ...formData, hsn_code: code })
                  // When HSN changes, update inherited category
                  if (code) {
                    fetch(`/api/hsn`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ codes: [code] })
                    })
                    .then(res => res.json())
                    .then(data => {
                      if (data.hsn_codes?.[0]) {
                        const hsn = data.hsn_codes[0]
                        setInheritedCategory({
                          category: hsn.category,
                          subcategory: hsn.short_description
                        })
                      }
                    })
                    .catch(err => console.error('Error fetching HSN details:', err))
                  } else {
                    setInheritedCategory(null)
                  }
                }}
              />
            </div>

            {/* Inherited Category Display */}
            {inheritedCategory && (
              <div className="mb-6 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <div className="text-sm">
                  <span className="font-medium">Inherited from HSN:</span>{' '}
                  <span className="text-primary">{inheritedCategory.category}</span>
                  {' → '}
                  <span className="text-primary">{inheritedCategory.subcategory}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  SKU <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="sku"
                  required
                  value={formData.sku}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
                  placeholder="Your SKU"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Display Name</label>
                <input
                  type="text"
                  name="display_name"
                  value={formData.display_name}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
                  placeholder="Product display name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Barcode</label>
                <input
                  type="text"
                  name="barcode"
                  value={formData.barcode}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
                  placeholder="Barcode"
                />
              </div>
            </div>
          </section>

          {/* Section 2: Pricing */}
          <section>
            <h3 className="font-semibold mb-4 text-sm">Pricing</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Wholesale Price</label>
                <input
                  type="number"
                  name="wholesale_price"
                  value={formData.wholesale_price}
                  onChange={handleInputChange}
                  step="0.01"
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">MRP</label>
                <input
                  type="number"
                  name="mrp"
                  value={formData.mrp}
                  onChange={handleInputChange}
                  step="0.01"
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
                  placeholder="0.00"
                />
              </div>
            </div>
            {/* Note: Tax rates are inherited from HSN code */}
            <p className="text-xs text-muted-foreground mt-2">
              Tax rates (CD/ST/GT) are automatically applied based on the selected HSN code.
            </p>
          </section>

          {/* Section 3: Inventory */}
          <section>
            <h3 className="font-semibold mb-4 text-sm">Inventory</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Current Stock</label>
                <input
                  type="number"
                  name="current_stock"
                  value={formData.current_stock}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Reorder Point</label>
                <input
                  type="number"
                  name="reorder_point"
                  value={formData.reorder_point}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
                />
              </div>
              <div className="flex items-center">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    name="is_active"
                    checked={formData.is_active}
                    onChange={handleInputChange}
                    className="rounded"
                  />
                  Active
                </label>
              </div>
            </div>
          </section>

          {/* Section 4: Manufacturer Details */}
          <section>
            <h3 className="font-semibold mb-4 text-sm">Manufacturer Details</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Manufacturer Name</label>
                <input
                  type="text"
                  name="manufacturer_name"
                  value={formData.manufacturer_name}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
                  placeholder="Manufacturer"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Brand</label>
                <input
                  type="text"
                  name="manufacturer_brand"
                  value={formData.manufacturer_brand}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
                  placeholder="Brand"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Country of Origin</label>
                <input
                  type="text"
                  name="country_of_origin"
                  value={formData.country_of_origin}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
                  placeholder="Country"
                />
              </div>
            </div>
          </section>

          {/* Section 5: Batch & Expiry */}
          <section>
            <h3 className="font-semibold mb-4 text-sm">Batch & Expiry</h3>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Batch Number</label>
                <input
                  type="text"
                  name="batch_number"
                  value={formData.batch_number}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
                  placeholder="Batch #"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Manufactured On</label>
                <input
                  type="date"
                  name="manufactured_on"
                  value={formData.manufactured_on}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Expiry Date</label>
                <input
                  type="date"
                  name="expiry_date"
                  value={formData.expiry_date}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Best Before</label>
                <input
                  type="date"
                  name="best_before"
                  value={formData.best_before}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
                />
              </div>
            </div>
          </section>

          {/* Section 6: Vendor Notes */}
          <section>
            <h3 className="font-semibold mb-4 text-sm">Vendor Notes</h3>
            <textarea
              name="vendor_notes"
              value={formData.vendor_notes}
              onChange={handleInputChange}
              rows={3}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm resize-none"
              placeholder="Additional notes..."
            />
          </section>

          {/* Section 7: Custom Specifications */}
          {formData.hsn_code && (
            <section>
              <EntityProductSpecifications
                hsnCode={formData.hsn_code}
                entityProductId={entityProduct?.id}
                values={specifications}
                onChange={setSpecifications}
              />
            </section>
          )}
        </div>
      </form>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" onClick={handleSubmit} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Saving...' : isEditing ? 'Update' : 'Add'} Product
        </Button>
      </div>
    </div>
  )
}

async function getToken() {
  const { createClient } = await import('@/lib/supabase/client')
  const client = createClient()
  const { data } = await client.auth.getSession()
  return data.session?.access_token
}
