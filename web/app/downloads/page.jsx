'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { OfficeShell } from '@/components/pos/office/office-shell'
import { OfficeForm, OfficeSection, OfficeField } from '@/components/pos/office/office-form'
import { MASTER_KEYS, withHandlers } from '@/lib/pos/office-keys'

function formatBytes(b) {
  if (!b) return null
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0, n = Number(b)
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`
}

export default function DownloadsPage() {
  const router = useRouter()
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

  // The installer, read as a release record (spec WF-09).
  //
  // This screen is reached from the Office letter menu (Alt+O → T → D) like any other office
  // screen, so it wears the same frame. The record is a SHEET rather than a card: version, size,
  // date and checksum are facts about one release, and a shopkeeper checking "am I on the newest
  // one" reads them the way they read a product card.
  const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-') : null)

  return (
    <OfficeShell
      crumb="Settings"
      title="Desktop App"
      keys={[
        ...(release?.download_url
          ? [{ key: 'D', label: 'Download', onClick: () => { window.location.href = release.download_url } }]
          : []),
        { key: 'L', label: 'Settings', onClick: () => router.push('/pos/settings') },
        ...withHandlers(MASTER_KEYS, {}).filter(k => k.key === 'Esc'),
      ]}
    >
      {loading ? (
        <p className="text-[12px] opacity-60 p-4">Loading…</p>
      ) : error ? (
        <p className="text-[12px] text-red-700 p-4">{error}</p>
      ) : !release ? (
        <p className="text-[12px] opacity-60 p-4">No desktop release is available yet.</p>
      ) : (
        <>
          <OfficeForm>
            <div>
              <OfficeSection title="Release">
                <OfficeField label="Version" value={release.version} />
                <OfficeField label="Platform" value="Windows" />
                <OfficeField label="Channel" value={release.channel ?? 'stable'} />
                <OfficeField label="Released" value={day(release.published_at)} />
                <OfficeField label="Required" value={release.mandatory ? 'Yes' : 'No'} />
              </OfficeSection>

              <OfficeSection title="Installer">
                <OfficeField label="File" value={release.file_name} />
                <OfficeField label="Size" value={formatBytes(release.file_size)} />
              </OfficeSection>
            </div>

            <div>
              <OfficeSection title="How to install">
                <ol className="list-decimal list-inside space-y-1 text-[12px]">
                  <li>Press D, or use the Download key below.</li>
                  <li>Run the .exe and follow the prompts.</li>
                  <li>Open Pelbu POS and activate it with your licence key.</li>
                  <li>To update later, run the newest installer over the existing one — your data is kept.</li>
                </ol>
              </OfficeSection>

              {release.notes && (
                <OfficeSection title="What&apos;s new">
                  <p className="text-[12px] whitespace-pre-line">{release.notes}</p>
                </OfficeSection>
              )}

              {release.sha256 && (
                <OfficeSection title="Checksum">
                  <p className="text-[10px] font-mono break-all opacity-75">SHA-256: {release.sha256}</p>
                </OfficeSection>
              )}
            </div>
          </OfficeForm>

          <p className="mt-2 text-[10px] opacity-60">
            The terminal also updates itself: it checks this same release on launch, so a shop only
            needs this page for a first install or when an update has to be forced.
          </p>
        </>
      )}
    </OfficeShell>
  )
}
