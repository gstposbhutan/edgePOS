'use client'

import { useEffect, useState } from 'react'
import { Download, Loader2, ShieldCheck, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'

function formatBytes(b) {
  if (!b) return null
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0, n = Number(b)
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`
}

export default function DownloadsPage() {
  const [release, setRelease] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/desktop/releases/latest?platform=win&channel=stable')
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load')
        setRelease(data.release)
      } catch (e) { setError(e.message) } finally { setLoading(false) }
    })()
  }, [])

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="flex flex-col items-center text-center mb-8">
          <Logo variant="stacked" className="h-20 w-auto mb-3" />
          <h1 className="text-2xl font-serif font-bold text-foreground">Pelbu POS — Desktop App</h1>
          <p className="text-sm text-muted-foreground mt-1">Install or update the offline POS terminal on your Windows PC.</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : error ? (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-500">{error}</div>
        ) : !release ? (
          <div className="p-6 border border-border rounded-xl bg-card text-center text-muted-foreground">
            No desktop release is available yet. Please check back soon.
          </div>
        ) : (
          <div className="border border-border rounded-xl bg-card overflow-hidden">
            <div className="p-6 flex items-start justify-between gap-4 border-b border-border">
              <div>
                <div className="flex items-center gap-2">
                  <Monitor className="h-5 w-5 text-primary" />
                  <span className="text-lg font-semibold">Version {release.version}</span>
                  {release.mandatory && <span className="text-[10px] uppercase tracking-wide bg-amber-500/15 text-amber-600 px-2 py-0.5 rounded-full">Required</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Windows {release.file_size ? `· ${formatBytes(release.file_size)}` : ''}
                  {release.published_at ? ` · released ${new Date(release.published_at).toLocaleDateString()}` : ''}
                </p>
              </div>
              {release.download_url ? (
                <Button asChild className="shrink-0">
                  <a href={release.download_url} download>
                    <Download className="h-4 w-4 mr-2" /> Download
                  </a>
                </Button>
              ) : (
                <Button disabled className="shrink-0">Installer pending</Button>
              )}
            </div>

            {release.notes && (
              <div className="p-6 border-b border-border">
                <p className="text-sm font-medium mb-2">What's new</p>
                <p className="text-sm text-muted-foreground whitespace-pre-line">{release.notes}</p>
              </div>
            )}

            <div className="p-6 space-y-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">How to install</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Download the installer above.</li>
                <li>Run the <code className="text-xs bg-muted px-1 py-0.5 rounded">.exe</code> and follow the prompts.</li>
                <li>Open Pelbu POS and activate it with your license key.</li>
                <li>To update later, download the newest version and run it over your existing install — your data is preserved.</li>
              </ol>
              {release.sha256 && (
                <p className="flex items-center gap-1.5 text-xs pt-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                  SHA-256: <span className="font-mono break-all">{release.sha256}</span>
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
