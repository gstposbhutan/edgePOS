'use client'

import { useState, useRef } from 'react'
import { X, Download, Upload, Loader2, FileSpreadsheet, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Vendor self-serve product import. Download the .xlsx template, fill it, upload it. The upload
 * first runs a dry-run (validate + preview), and only writes on confirm. All-or-nothing: if any
 * row has an error the import is blocked until the vendor fixes + re-uploads.
 */
export function ProductImportModal({ open, onClose, onImported }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)   // { total, valid, errors, sample }
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)     // { imported, failed }
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  if (!open) return null

  function reset() {
    setFile(null); setPreview(null); setResult(null); setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleFile(f) {
    if (!f) return
    setFile(f); setPreview(null); setResult(null); setError(null)
    setBusy(true)
    try {
      const body = new FormData()
      body.append('file', f)
      const res = await fetch('/api/products/import?dryRun=1', { method: 'POST', body })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not read the file'); }
      else setPreview(data)
    } catch { setError('Upload failed') }
    setBusy(false)
  }

  async function handleImport() {
    if (!file) return
    setBusy(true); setError(null)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/products/import', { method: 'POST', body })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Import failed'); if (data.errors) setPreview(p => ({ ...(p || {}), errors: data.errors })) }
      else { setResult(data); onImported?.() }
    } catch { setError('Import failed') }
    setBusy(false)
  }

  const canImport = preview && preview.valid > 0 && (!preview.errors || preview.errors.length === 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background rounded-xl shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" /> Import Products from Excel</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {result ? (
            <div className="text-center py-6 space-y-3">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
              <p className="font-medium">Imported {result.imported} product{result.imported === 1 ? '' : 's'}.</p>
              {result.failed?.length > 0 && (
                <p className="text-xs text-tibetan">{result.failed.length} row(s) failed to save.</p>
              )}
              <div className="flex justify-center gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={reset}>Import more</Button>
                <Button size="sm" onClick={onClose}>Done</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                <p className="text-xs text-muted-foreground">Step 1 — Download the template, fill one row per product (keep the column headers), then upload it below.</p>
                <a href="/api/products/import/template" download>
                  <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1.5" /> Download Excel template</Button>
                </a>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Step 2 — Upload your filled file (.xlsx).</p>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                  className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
                />
              </div>

              {busy && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Reading file…</div>}

              {error && (
                <div className="rounded-lg bg-tibetan/10 border border-tibetan/30 text-tibetan text-xs p-3 flex gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> <span>{error}</span>
                </div>
              )}

              {preview && (
                <div className="rounded-lg border border-border p-3 space-y-2">
                  <p className="text-sm">
                    <span className="font-medium">{preview.valid}</span> of <span className="font-medium">{preview.total}</span> rows ready to import.
                  </p>
                  {preview.errors?.length > 0 && (
                    <div className="text-xs text-tibetan space-y-1 max-h-40 overflow-y-auto">
                      <p className="font-medium flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Fix these rows and re-upload:</p>
                      {preview.errors.slice(0, 20).map((e, i) => (
                        <p key={i}>Row {e.row}: {e.message}</p>
                      ))}
                      {preview.errors.length > 20 && <p>…and {preview.errors.length - 20} more.</p>}
                    </div>
                  )}
                  {preview.sample?.length > 0 && (!preview.errors || preview.errors.length === 0) && (
                    <div className="text-xs text-muted-foreground">
                      e.g. {preview.sample.slice(0, 3).map(s => `${s.name} (Nu. ${s.selling_price})`).join(', ')}…
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
                <Button size="sm" disabled={!canImport || busy} onClick={handleImport}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Upload className="h-4 w-4 mr-1.5" /> Import {preview?.valid || ''} products</>}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
