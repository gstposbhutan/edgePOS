'use client'

import { useState, useEffect } from 'react'
import { SlidersHorizontal, Plus, X, Trash2, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const TYPES = ['text', 'number', 'select']

// Super-admin manages the custom-property set for each (HSN-derived) category. These properties
// drive the product form's custom fields and the AI enrichment's specifications.
export default function PropertyTemplatesPage() {
  const [templates, setTemplates] = useState([])   // [{category, properties:[{key,label,type,options}]}]
  const [loading, setLoading] = useState(true)
  const [savingCat, setSavingCat] = useState(null)
  const [newCat, setNewCat] = useState('')
  const [msg, setMsg] = useState(null)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/property-templates')
    const data = await res.json()
    setTemplates((data.templates || []).map(t => ({ ...t, properties: t.properties || [] })))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function updateCat(category, mutate) {
    setTemplates(ts => ts.map(t => t.category === category ? { ...t, properties: mutate(t.properties) } : t))
  }
  const addRow = (c) => updateCat(c, p => [...p, { key: '', label: '', type: 'text' }])
  const delRow = (c, i) => updateCat(c, p => p.filter((_, idx) => idx !== i))
  const setRow = (c, i, field, val) => updateCat(c, p => p.map((r, idx) => idx === i ? { ...r, [field]: val } : r))

  async function save(category) {
    const t = templates.find(x => x.category === category)
    setSavingCat(category); setMsg(null)
    const res = await fetch('/api/admin/property-templates', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, properties: t.properties }),
    })
    setSavingCat(null)
    setMsg(res.ok ? { type: 'ok', text: `Saved "${category}"` } : { type: 'err', text: 'Save failed' })
    if (res.ok) load()
  }

  async function removeTemplate(category) {
    if (!confirm(`Delete the property template for "${category}"?`)) return
    await fetch(`/api/admin/property-templates?category=${encodeURIComponent(category)}`, { method: 'DELETE' })
    load()
  }

  function addTemplate() {
    const c = newCat.trim()
    if (!c) return
    if (templates.some(t => t.category.toLowerCase() === c.toLowerCase())) { setMsg({ type: 'err', text: 'Category already exists' }); return }
    setTemplates(ts => [...ts, { category: c, properties: [] }].sort((a, b) => a.category.localeCompare(b.category)))
    setNewCat('')
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-serif font-bold flex items-center gap-2"><SlidersHorizontal className="h-6 w-6" /> Product Properties</h1>
        <p className="text-sm text-muted-foreground">Custom properties per category — used by the product form and AI enrichment.</p>
      </div>

      {msg && <div className={`p-2.5 rounded-lg text-xs ${msg.type === 'ok' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30' : 'bg-tibetan/10 text-tibetan border border-tibetan/30'}`}>{msg.text}</div>}

      {/* Add a new category template */}
      <div className="flex gap-2">
        <Input placeholder="New category (e.g. Appliances)" value={newCat} onChange={e => setNewCat(e.target.value)} className="max-w-xs" />
        <Button variant="outline" onClick={addTemplate}><Plus className="h-4 w-4 mr-1" /> Add category</Button>
      </div>

      {templates.map(t => (
        <div key={t.category} className="border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{t.category}</h2>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" className="text-tibetan" onClick={() => removeTemplate(t.category)}><Trash2 className="h-4 w-4" /></Button>
              <Button size="sm" onClick={() => save(t.category)} disabled={savingCat === t.category}>
                {savingCat === t.category ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Save</>}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {t.properties.length === 0 && <p className="text-xs text-muted-foreground">No properties yet — add one below.</p>}
            {t.properties.map((p, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input placeholder="Label (e.g. Screen size)" value={p.label} onChange={e => setRow(t.category, i, 'label', e.target.value)} className="w-44" />
                <Input placeholder="key" value={p.key} onChange={e => setRow(t.category, i, 'key', e.target.value)} className="w-36 font-mono text-xs" />
                <select value={p.type} onChange={e => setRow(t.category, i, 'type', e.target.value)} className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm">
                  {TYPES.map(ty => <option key={ty} value={ty}>{ty}</option>)}
                </select>
                {p.type === 'select' && (
                  <Input placeholder="options, comma-separated" value={(p.options || []).join(', ')}
                    onChange={e => setRow(t.category, i, 'options', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} className="flex-1 min-w-[10rem]" />
                )}
                <button onClick={() => delRow(t.category, i)} className="text-muted-foreground hover:text-tibetan"><X className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={() => addRow(t.category)}><Plus className="h-4 w-4 mr-1" /> Add property</Button>
        </div>
      ))}
    </div>
  )
}
