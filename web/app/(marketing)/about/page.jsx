import { CtaBand } from '@/components/marketing/cta-band'
import { COMPANY, TEAM } from '@/lib/marketing/content'
import { MapPin, ShieldCheck, WifiOff, HeartHandshake } from 'lucide-react'

export const metadata = {
  title: 'About Pelbu',
  description: 'Pelbu is a local-first AI point of sale and marketplace built for Bhutan’s retail ecosystem — designed for real shops, real connectivity, and real compliance.',
}

const VALUES = [
  { icon: MapPin, title: 'Built for Bhutan', body: 'Designed around Bhutanese shops, GST 2026 rules and the way business really works here — not a Western POS bolted on.' },
  { icon: WifiOff, title: 'Local-first', body: 'The register works fully offline and syncs when it can. Power cuts and patchy internet don’t stop a sale.' },
  { icon: ShieldCheck, title: 'Compliant by default', body: 'Flat 5% GST, digital signatures and audit trails are built in, so every sale is filed correctly.' },
  { icon: HeartHandshake, title: 'For every tier', body: 'Distributors, wholesalers, retailers and shoppers all share one platform and one product catalog.' },
]

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pt-10 sm:pt-16">
        <div className="relative overflow-hidden rounded-3xl border border-border">
          <img src="/marketing/hero-about.webp" alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-foreground/90 via-foreground/70 to-foreground/20" />
          <div className="relative max-w-xl px-6 py-16 sm:px-12 sm:py-24">
            <span className="text-xs font-semibold uppercase tracking-wide text-primary">Our story</span>
            <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-background sm:text-5xl">
              Technology that respects how Bhutan shops
            </h1>
            <p className="mt-4 text-lg text-background/80">
              Pelbu was built to give Bhutanese businesses an elite, million-dollar-feeling tool that still
              works on a shop counter with a spotty connection.
            </p>
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="mx-auto max-w-3xl px-4 py-16">
        <h2 className="text-3xl font-bold tracking-tight">Our mission</h2>
        <div className="mt-5 space-y-4 text-muted-foreground">
          <p>
            Retail in Bhutan spans a whole chain — from distributors bringing goods across the border, to
            wholesalers supplying towns, to the retailer at the counter, to the customer at home. Most software
            only serves one slice of that, assumes always-on internet, and treats compliance as an afterthought.
          </p>
          <p>
            Pelbu takes the opposite approach. A single platform connects every tier. The point of sale runs
            locally and keeps working through outages. GST 2026 is calculated, signed and reportable on every
            sale. And the same catalog a shop sells in-store is instantly available on the online marketplace.
          </p>
          <p>
            The result is software that feels premium but stays accessible — designed for low-literacy, high-touch
            use, with AI doing the heavy lifting so shopkeepers can focus on their customers.
          </p>
        </div>
      </section>

      {/* Values */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="grid gap-6 sm:grid-cols-2">
          {VALUES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-border bg-card p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Powered by Innovates Bhutan */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="rounded-3xl border border-border bg-card p-8 sm:p-12">
          <span className="text-xs font-semibold uppercase tracking-wide text-primary">Powered by {COMPANY.name}</span>
          <h2 className="mt-3 text-2xl font-bold tracking-tight">Built by Bhutan&apos;s IT enterprise</h2>
          <p className="mt-3 max-w-3xl text-muted-foreground">{COMPANY.blurb}</p>
          <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {COMPANY.stats.map(s => (
              <div key={s.label}>
                <div className="text-3xl font-bold tracking-tight text-primary">{s.value}</div>
                <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
          <a
            href={COMPANY.website}
            target="_blank"
            rel="noreferrer"
            className="mt-8 inline-flex text-sm font-medium text-foreground hover:text-primary"
          >
            Visit {COMPANY.name} →
          </a>
        </div>
      </section>

      {/* Team */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-wide text-primary">Our team</span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight">The people behind Pelbu</h2>
          <p className="mt-3 text-muted-foreground">
            A passionate team of technology experts dedicated to transforming businesses across Bhutan.
          </p>
        </div>

        {/* Founder */}
        <div className="mt-8 flex items-center gap-5 rounded-2xl border border-border bg-card p-6">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">
            {TEAM.lead.name.split(' ').map(n => n[0]).join('')}
          </div>
          <div>
            <h3 className="text-lg font-semibold">{TEAM.lead.name}</h3>
            <p className="text-sm font-medium text-primary">{TEAM.lead.role}</p>
            <p className="mt-1 text-sm text-muted-foreground">{TEAM.lead.bio}</p>
          </div>
        </div>

        {/* Departments */}
        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          {TEAM.groups.map(g => (
            <div key={g.name} className="rounded-2xl border border-border bg-card p-6">
              <h3 className="text-lg font-semibold">{g.name}</h3>
              <p className="text-sm font-medium text-primary">{g.role}</p>
              <p className="mt-2 text-sm text-muted-foreground">{g.body}</p>
            </div>
          ))}
        </div>
      </section>

      <CtaBand
        title="Join the businesses building on Pelbu"
        body="From a single shop to a national distributor — there’s a place for you on the platform."
      />
    </>
  )
}
