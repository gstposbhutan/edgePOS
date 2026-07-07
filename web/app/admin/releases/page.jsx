'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import { Plus, Trash2, Upload, Eye, EyeOff, Loader2, Download, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'

function formatBytes(b) {
  if (!b) return '—'
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0, n = Number(b)
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`
}

const EMPTY = { version: '', channel: 'stable', platform: 'win', notes: '', download_url: '', mandatory: false, is_published: false }

export default function ReleasesPage() {
  const [releases, setReleases] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(EMPTY)
  const [saving, setSaving]     = useState(false)
  const [uploadingId, setUploadingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/admin/desktop-releases')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setReleases(data.releases)
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate(e) {
    e.preventDefault(); setSaving(true); setError(null)
    try {
      const res = await fetch('/api/admin/desktop-releases', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create')
      setShowForm(false); setForm(EMPTY); load()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  async function patch(id, body) {
    const res = await fetch(`/api/admin/desktop-releases/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || 'Update failed'); return }
    load()
  }

  async function remove(r) {
    if (!confirm(`Delete release ${r.version} (${r.channel}/${r.platform})?`)) return
    const res = await fetch(`/api/admin/desktop-releases/${r.id}`, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || 'Delete failed'); return }
    load()
  }

  async function uploadAsset(id, file) {
    if (!file) return
    setUploadingId(id); setError(null)
    try {
      const body = new FormData(); body.append('file', file)
      const res = await fetch(`/api/admin/desktop-releases/${id}/asset`, { method: 'POST', body })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      load()
    } catch (e) { setError(e.message) } finally { setUploadingId(null) }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-serif font-bold">Desktop App Releases</h1>
          <p className="text-sm text-muted-foreground">Publish Pelbu POS installer versions. Vendors and the desktop app fetch the latest published release.</p>
        </div>
        <Button onClick={() => { setForm(EMPTY); setShowForm(v => !v) }}>
          <Plus className="h-4 w-4 mr-2" /> New Release
        </Button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-500">{error}</div>}

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 p-4 border border-border rounded-lg bg-card space-y-4">
          <h2 className="text-lg font-semibold">New Release</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Version *</label>
              <input required value={form.version} onChange={e => setForm({ ...form, version: e.target.value })}
                placeholder="1.0.0" className="w-full px-3 py-2 border border-input rounded-md bg-background" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Channel</label>
              <select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })}
                className="w-full px-3 py-2 border border-input rounded-md bg-background">
                <option value="stable">stable</option><option value="beta">beta</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Platform</label>
              <select value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })}
                className="w-full px-3 py-2 border border-input rounded-md bg-background">
                <option value="win">win</option><option value="mac">mac</option><option value="linux">linux</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Release notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3}
              placeholder="What's new in this version…" className="w-full px-3 py-2 border border-input rounded-md bg-background" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Download URL (optional — or upload the installer after creating)</label>
            <input value={form.download_url} onChange={e => setForm({ ...form, download_url: e.target.value })}
              placeholder="https://img.pelbu.com/releases/…" className="w-full px-3 py-2 border border-input rounded-md bg-background" />
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.mandatory} onChange={e => setForm({ ...form, mandatory: e.target.checked })} /> Mandatory update</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_published} onChange={e => setForm({ ...form, is_published: e.target.checked })} /> Publish now</label>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}</Button>
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      )}

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Version</th>
              <th className="px-4 py-2 text-left font-medium">Channel / Platform</th>
              <th className="px-4 py-2 text-left font-medium">Installer</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
            ) : releases.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No releases yet</td></tr>
            ) : releases.map(r => (
              <Fragment key={r.id}>
              <tr className="border-t border-border">
                <td className="px-4 py-2 font-mono font-semibold">
                  {r.version} {r.mandatory && <Star className="inline h-3 w-3 text-amber-500" title="Mandatory" />}
                </td>
                <td className="px-4 py-2">{r.channel} / {r.platform}</td>
                <td className="px-4 py-2">
                  {r.download_url ? (
                    <a href={r.download_url} className="inline-flex items-center gap-1 text-primary hover:underline" target="_blank" rel="noreferrer">
                      <Download className="h-3 w-3" /> {formatBytes(r.file_size)}
                    </a>
                  ) : <span className="text-muted-foreground">— pending</span>}
                </td>
                <td className="px-4 py-2">
                  <button onClick={() => patch(r.id, { is_published: !r.is_published })}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${r.is_published ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'}`}>
                    {r.is_published ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    {r.is_published ? 'Published' : 'Draft'}
                  </button>
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <label className="inline-flex items-center p-1 hover:bg-muted rounded mr-1 cursor-pointer" title="Upload installer">
                    {uploadingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    <input type="file" accept=".exe,.dmg,.AppImage,application/octet-stream" className="hidden"
                      disabled={uploadingId === r.id} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; uploadAsset(r.id, f) }} />
                  </label>
                  <button onClick={() => remove(r)} className="p-1 hover:bg-muted rounded text-red-500" title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
              {r.notes && (
                <tr>
                  <td />
                  <td colSpan={4} className="px-4 pb-2.5 pt-0 text-xs text-muted-foreground whitespace-pre-wrap align-top">
                    {r.notes}
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
