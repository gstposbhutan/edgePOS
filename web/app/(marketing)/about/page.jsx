import { CtaBand } from '@/components/marketing/cta-band'
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

      <CtaBand
        title="Join the businesses building on Pelbu"
        body="From a single shop to a national distributor — there’s a place for you on the platform."
      />
    </>
  )
}
