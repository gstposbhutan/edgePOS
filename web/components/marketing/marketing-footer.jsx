import Link from 'next/link'
import { Logo } from '@/components/ui/logo'
import { PILLARS } from '@/lib/marketing/content'

const COLS = [
  {
    heading: 'Product',
    links: [
      { label: 'Overview', href: '/features' },
      ...PILLARS.map(p => ({ label: p.eyebrow, href: `/features/${p.slug}` })),
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Sell on Pelbu', href: '/sell' },
      { label: 'Contact', href: '/contact' },
      { label: 'Marketplace', href: '/shop' },
    ],
  },
  {
    heading: 'Get started',
    links: [
      { label: 'Open a retail shop', href: '/signup/retailer' },
      { label: 'Wholesaler account', href: '/signup/wholesaler' },
      { label: 'Distributor account', href: '/signup/distributor' },
      { label: 'Log in', href: '/login' },
    ],
  },
]

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <Logo variant="horizontal" className="h-8 w-auto" />
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Local-first AI point of sale, GST 2026 compliance and a marketplace for Bhutan&apos;s retail ecosystem.
            </p>
          </div>
          {COLS.map(col => (
            <div key={col.heading}>
              <h3 className="text-sm font-semibold text-foreground">{col.heading}</h3>
              <ul className="mt-3 space-y-2">
                {col.links.map(l => (
                  <li key={l.href + l.label}>
                    <Link href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-start justify-between gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>© {2026} Pelbu. Made in Bhutan.</p>
          <p>5% GST 2026 compliant · Offline-first · WhatsApp-ready</p>
        </div>
      </div>
    </footer>
  )
}
