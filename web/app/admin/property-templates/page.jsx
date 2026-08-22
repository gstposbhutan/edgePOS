'use client'

import { useState, useEffect } from 'react'
import { SlidersHorizontal, Plus, X, Trash2, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const TYPES = ['text', 'number', 'select']
const SEP = '␟'
const tkey = (c, s) => `${c}${SEP}${s || ''}`

// Super-admin manages custom properties per (category, subcategory) from the product HSN tree.
// These drive the product form's custom fields and the AI enrichment's specifications.
export default function PropertyTemplatesPage() {
  const [templates, setTemplates] = useState([])   // [{category, subcategory, properties:[{key,label,type,options}]}]
  const [tree, setTree] = useState([])              // [{category, subcategories:[]}]
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState(null)
  const [selCat, setSelCat] = useState('')
  const [selSub, setSelSub] = useState('')
  const [msg, setMsg] = useState(null)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/property-templates')
    const data = await res.json()
    setTemplates((data.templates || []).map(t => ({ ...t, subcategory: t.subcategory || '', properties: t.properties || [] })))
    setTree(data.tree || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const same = (t, c, s) => t.category === c && (t.subcategory || '') === (s || '')
  function mutate(c, s, fn) {
    setTemplates(ts => ts.map(t => same(t, c, s) ? { ...t, properties: fn(t.properties) } : t))
  }
  const addRow = (c, s) => mutate(c, s, p => [...p, { key: '', label: '', type: 'text' }])
  const delRow = (c, s, i) => mutate(c, s, p => p.filter((_, idx) => idx !== i))
  const setRow = (c, s, i, field, val) => mutate(c, s, p => p.map((r, idx) => idx === i ? { ...r, [field]: val } : r))

  async function save(c, s) {
    const t = templates.find(x => same(x, c, s))
    setSavingKey(tkey(c, s)); setMsg(null)
    const res = await fetch('/api/admin/property-templates', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: c, subcategory: s, properties: t.properties }),
    })
    setSavingKey(null)
    setMsg(res.ok ? { type: 'ok', text: `Saved "${c}${s ? ' › ' + s : ''}"` } : { type: 'err', text: 'Save failed' })
    if (res.ok) load()
  }

  async function removeTemplate(c, s) {
    if (!confirm(`Delete the property template for "${c}${s ? ' › ' + s : ''}"?`)) return
    await fetch(`/api/admin/property-templates?category=${encodeURIComponent(c)}&subcategory=${encodeURIComponent(s || '')}`, { method: 'DELETE' })
    load()
  }

  const sortT = (a, b) => a.category.localeCompare(b.category) || (a.subcategory || '').localeCompare(b.subcategory || '')
  function addTemplate() {
    const c = selCat.trim(); if (!c) return
    const s = selSub.trim()
    if (templates.some(t => same(t, c, s))) { setMsg({ type: 'err', text: 'That template already exists' }); return }
    setTemplates(ts => [...ts, { category: c, subcategory: s, properties: [] }].sort(sortT))
    setSelCat(''); setSelSub('')
  }
  const subOptions = tree.find(t => t.category === selCat)?.subcategories || []

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-serif font-bold flex items-center gap-2"><SlidersHorizontal className="h-6 w-6" /> Product Properties</h1>
        <p className="text-sm text-muted-foreground">Custom properties per category / subcategory — drawn from the product HSN tree; used by the product form and AI enrichment.</p>
      </div>

      {msg && <div className={`p-2.5 rounded-lg text-xs ${msg.type === 'ok' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30' : 'bg-tibetan/10 text-tibetan border border-tibetan/30'}`}>{msg.text}</div>}

      {/* Add a template for a category (+ optional subcategory) from the live product tree */}
      <div className="flex flex-wrap gap-2 items-center">
        <select value={selCat} onChange={e => { setSelCat(e.target.value); setSelSub('') }} className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm min-w-[12rem]">
          <option value="">Select category…</option>
          {tree.map(t => <option key={t.category} value={t.category}>{t.category}</option>)}
        </select>
        <select value={selSub} onChange={e => setSelSub(e.target.value)} disabled={!selCat} className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm min-w-[12rem] disabled:opacity-50">
          <option value="">(whole category)</option>
          {subOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <Button variant="outline" onClick={addTemplate} disabled={!selCat}><Plus className="h-4 w-4 mr-1" /> Add template</Button>
      </div>
      {tree.length === 0 && <p className="text-xs text-muted-foreground">No categories found on products yet.</p>}

      {templates.map(t => (
        <div key={tkey(t.category, t.subcategory)} className="border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">
              {t.category}
              {t.subcategory
                ? <span className="text-muted-foreground font-normal"> › {t.subcategory}</span>
                : <span className="text-muted-foreground font-normal text-xs"> · whole category</span>}
            </h2>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" className="text-tibetan" onClick={() => removeTemplate(t.category, t.subcategory)}><Trash2 className="h-4 w-4" /></Button>
              <Button size="sm" onClick={() => save(t.category, t.subcategory)} disabled={savingKey === tkey(t.category, t.subcategory)}>
                {savingKey === tkey(t.category, t.subcategory) ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Save</>}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {t.properties.length === 0 && <p className="text-xs text-muted-foreground">No properties yet — add one below.</p>}
            {t.properties.map((p, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input placeholder="Label (e.g. Screen size)" value={p.label} onChange={e => setRow(t.category, t.subcategory, i, 'label', e.target.value)} className="w-44" />
                <Input placeholder="key" value={p.key} onChange={e => setRow(t.category, t.subcategory, i, 'key', e.target.value)} className="w-36 font-mono text-xs" />
                <select value={p.type} onChange={e => setRow(t.category, t.subcategory, i, 'type', e.target.value)} className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm">
                  {TYPES.map(ty => <option key={ty} value={ty}>{ty}</option>)}
                </select>
                {p.type === 'select' && (
                  <Input placeholder="options, comma-separated" value={(p.options || []).join(', ')}
                    onChange={e => setRow(t.category, t.subcategory, i, 'options', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} className="flex-1 min-w-[10rem]" />
                )}
                <button onClick={() => delRow(t.category, t.subcategory, i)} className="text-muted-foreground hover:text-tibetan"><X className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={() => addRow(t.category, t.subcategory)}><Plus className="h-4 w-4 mr-1" /> Add property</Button>
        </div>
      ))}
    </div>
  )
}
