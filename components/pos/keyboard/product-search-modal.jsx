"use client"

import { useState, useEffect, useRef } from "react"
import { Search, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

const BARCODE_THRESHOLD_MS = 200
const BARCODE_MIN_DIGITS   = 8

/**
 * Full-screen product search modal for keyboard POS.
 * Triggered by F3, "/" or any printable keypress on the cart.
 *
 * @param {{ open: boolean, initialQuery: string, entityId: string, onAdd: (product, qty, unit) => void, onClose: () => void }} props
 */
export function ProductSearchModal({ open, initialQuery = '', entityId, onAdd, onClose }) {
  const supabase = createClient()

  const [query,    setQuery]    = useState(initialQuery)
  const [results,  setResults]  = useState([])
  const [selected, setSelected] = useState(0)
  const [loading,  setLoading]  = useState(false)
  const [qty,      setQty]      = useState('1')
  const [unit,     setUnit]     = useState(0) // index into product.variants

  const inputRef = useRef(null)
  // Barcode scanner detection
  const barcodeBuffer = useRef('')
  const barcodeTimer  = useRef(null)

  // Reset state on open
  useEffect(() => {
    if (open) {
      setQuery(initialQuery)
      setResults([])
      setSelected(0)
      setQty('1')
      setUnit(0)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open, initialQuery])

  // Search when query changes
  useEffect(() => {
    if (!query.trim()) { setResults([]); return }

    // Barcode: all digits, 8+ chars — exact lookup
    if (/^\d{8,}$/.test(query.trim())) {
      lookupBarcode(query.trim())
      return
    }

    const timer = setTimeout(() => searchProducts(query), 200)
    return () => clearTimeout(timer)
  }, [query, entityId])

  async function searchProducts(q) {
    setLoading(true)
    const { data } = await supabase
      .from('sellable_products')
      .select('id, name, sku, mrp, selling_price, available_stock, unit, batch_id, batch_number, expires_at')
      .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
      .gt('available_stock', 0)
      .order('name')
      .limit(9)
    setResults(data || [])
    setSelected(0)
    setLoading(false)
  }

  async function lookupBarcode(code) {
    setLoading(true)

    // 1. Try product_batches barcode first (entity-scoped, batch-specific price)
    const { data: batchData } = await supabase
      .from('product_batches')
      .select(`
        id, batch_number, expires_at, mrp, selling_price, quantity,
        products!inner(id, name, sku, unit, mrp, selling_price)
      `)
      .eq('barcode', code)
      .eq('status', 'ACTIVE')
      .gt('quantity', 0)
      .limit(1)
      .single()

    if (batchData) {
      const product = {
        id:              batchData.products.id,
        name:            batchData.products.name,
        sku:             batchData.products.sku,
        unit:            batchData.products.unit,
        mrp:             batchData.mrp ?? batchData.products.mrp,
        selling_price:   batchData.selling_price ?? batchData.products.selling_price ?? batchData.mrp,
        available_stock: batchData.quantity,
        batch_id:        batchData.id,
        batch_number:    batchData.batch_number,
        expires_at:      batchData.expires_at,
      }
      handleAdd(product)
      setLoading(false)
      return
    }

    // 2. Fallback: look up by product SKU in sellable_products
    const { data } = await supabase
      .from('sellable_products')
      .select('id, name, sku, mrp, selling_price, available_stock, unit, batch_id, batch_number, expires_at')
      .eq('sku', code)
      .gt('available_stock', 0)
      .limit(1)
    if (data?.[0]) {
      handleAdd(data[0])
    } else {
      setResults([])
    }
    setLoading(false)
  }

  function handleAdd(product) {
    const quantity = Math.max(1, parseInt(qty, 10) || 1)
    onAdd(product, quantity)
    onClose()
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (results.length > 0) setSelected(s => (s + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (results.length > 0) setSelected(s => (s - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (results[selected]) handleAdd(results[selected])
    } else if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.altKey) {
      // 1–9 shortcut — only fire if the key matches an existing result row
      const idx = parseInt(e.key, 10) - 1
      if (results[idx]) {
        e.preventDefault()
        handleAdd(results[idx])
      }
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
      {/* Search input */}
      <div className="border-b border-border px-4 py-3 flex items-center gap-3">
        <Search className="h-5 w-5 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search product name or SKU, or scan barcode..."
          className="flex-1 text-base bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
        />
        {query && (
          <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border"
        >
          Esc
        </button>
      </div>

      {/* Results table */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-sm text-muted-foreground text-center">Searching...</div>
        ) : results.length === 0 && query.trim() ? (
          <div className="p-8 text-center text-muted-foreground">
            <p className="text-sm">No products found for "{query}"</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                <th className="w-8 px-2 py-2" />
                <th className="text-left px-4 py-2 font-medium">Product</th>
                <th className="text-left px-4 py-2 font-medium">SKU</th>
                <th className="text-right px-4 py-2 font-medium">Stock</th>
                <th className="text-right px-4 py-2 font-medium">Price</th>
              </tr>
            </thead>
            <tbody>
              {results.map((product, i) => (
                <tr
                  key={product.id}
                  onClick={() => handleAdd(product)}
                  onMouseEnter={() => setSelected(i)}
                  className={`border-b border-border cursor-pointer transition-colors ${
                    i === selected ? 'bg-primary/10' : 'hover:bg-muted/30'
                  }`}
                >
                  <td className="px-2 py-3 text-center">
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold border ${
                      i === selected
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted border-border text-muted-foreground'
                    }`}>
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{product.name}</p>
                    {product.batch_number && (
                      <p className="text-[10px] text-muted-foreground">
                        Batch: {product.batch_number}{product.expires_at ? ` · Exp: ${new Date(product.expires_at).toLocaleDateString()}` : ''}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{product.sku}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{product.available_stock}</td>
                  <td className="px-4 py-3 text-right">
                    <p className="font-semibold text-primary">Nu. {parseFloat(product.selling_price ?? product.mrp).toFixed(2)}</p>
                    {product.selling_price && product.mrp && parseFloat(product.selling_price) < parseFloat(product.mrp) && (
                      <p className="text-[10px] text-muted-foreground line-through">Nu. {parseFloat(product.mrp).toFixed(2)}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Bottom: qty input + keyboard hints */}
      <div className="border-t border-border px-4 py-3 flex items-center gap-6 bg-muted/20">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Qty:</label>
          <input
            type="number"
            min="1"
            value={qty}
            onChange={e => setQty(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (results[selected]) handleAdd(results[selected]) } }}
            className="w-16 px-2 py-1 text-sm border border-input rounded bg-background text-center"
          />
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>↑↓ navigate</span>
          <span>1–9 add directly</span>
          <span>Enter add selected</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  )
}
