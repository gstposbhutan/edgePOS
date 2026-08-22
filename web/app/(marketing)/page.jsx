import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { CtaBand } from '@/components/marketing/cta-band'
import { PILLARS, HOME_STATS } from '@/lib/marketing/content'
import { ScanLine, WifiOff, ReceiptText, ShoppingBag, ArrowRight, Check } from 'lucide-react'

export const metadata = {
  title: 'Pelbu — Local-first AI point of sale for Bhutan',
  description: 'A 4K AI-vision POS, GST 2026 compliance, and an online marketplace — one platform for Bhutan’s distributors, wholesalers, retailers and shoppers.',
}

const QUICK = [
  { icon: ScanLine, label: 'AI product recognition' },
  { icon: WifiOff, label: 'Works fully offline' },
  { icon: ReceiptText, label: 'GST receipts in a tap' },
  { icon: ShoppingBag, label: 'Sell online too' },
]

export default function MarketingHome() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pt-10 sm:pt-16">
        <div className="relative overflow-hidden rounded-3xl border border-border">
          <img
            src="/marketing/hero-home.webp"
            alt="A Bhutanese shopkeeper using the Pelbu point-of-sale terminal"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-foreground/90 via-foreground/70 to-foreground/20" />
          <div className="relative max-w-xl px-6 py-16 sm:px-12 sm:py-24">
            <span className="inline-flex items-center rounded-full border border-background/25 bg-background/10 px-3 py-1 text-xs font-medium text-background backdrop-blur">
              4K Edge-AI · GST 2026 · Made in Bhutan
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-background sm:text-5xl">
              The point of sale that sees what you sell.
            </h1>
            <p className="mt-4 text-lg text-background/80">
              Pelbu is a local-first AI POS, a GST-2026 accounting engine, and an online marketplace —
              one platform for every tier of Bhutan&apos;s retail ecosystem.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/sell"><Button size="lg">Start selling</Button></Link>
              <Link href="/features">
                <Button size="lg" variant="outline" className="border-background/30 bg-transparent text-background hover:bg-background/10 hover:text-background">
                  Explore features
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* quick feature chips */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {QUICK.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
              <Icon className="h-5 w-5 shrink-0 text-primary" />
              <span className="text-sm font-medium">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {HOME_STATS.map(s => (
            <div key={s.label} className="rounded-2xl border border-border bg-card p-6 text-center">
              <div className="text-4xl font-bold tracking-tight text-primary">{s.value}</div>
              <p className="mt-2 text-sm text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Two audiences */}
      <section className="mx-auto max-w-6xl px-4 pb-4">
        <div className="grid gap-6 md:grid-cols-2">
          <AudienceCard
            image="/marketing/hero-pos.webp"
            eyebrow="For your shop"
            title="Run the counter with AI"
            body="A 4K terminal that recognises products, works offline, prints and sends receipts, and keeps you GST-compliant on every sale."
            href="/features/pos"
            cta="See the POS"
          />
          <AudienceCard
            image="/marketing/hero-marketplace.webp"
            eyebrow="For your customers"
            title="Sell online, locally"
            body="List your shop on the Pelbu marketplace. Customers browse local stores and order for pickup or delivery — from the same catalog you sell in-store."
            href="/features/marketplace"
            cta="See the marketplace"
          />
        </div>
      </section>

      {/* Pillars */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight">One platform, four pillars</h2>
          <p className="mt-3 text-muted-foreground">
            From the shop counter to government filing to last-mile delivery — Pelbu covers the whole chain.
          </p>
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {PILLARS.map(p => (
            <Link
              key={p.slug}
              href={`/features/${p.slug}`}
              className="group flex flex-col rounded-2xl border border-border bg-card p-6 transition-all hover:border-primary/40 hover:shadow-lg"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-primary">{p.eyebrow}</span>
              <h3 className="mt-2 text-xl font-semibold">{p.title}</h3>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{p.tagline}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-foreground">
                Learn more
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <CtaBand />
    </>
  )
}

function AudienceCard({ image, eyebrow, title, body, href, cta }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="relative h-48 w-full">
        <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
      </div>
      <div className="p-6">
        <span className="text-xs font-semibold uppercase tracking-wide text-primary">{eyebrow}</span>
        <h3 className="mt-2 text-xl font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        <Link href={href} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-foreground hover:text-primary">
          {cta} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}
