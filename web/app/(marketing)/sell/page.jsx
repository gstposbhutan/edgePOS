import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { CtaBand } from '@/components/marketing/cta-band'
import { Store, Building2, Truck, Check, ScanLine, ShoppingBag, ReceiptText } from 'lucide-react'

export const metadata = {
  title: 'Sell on Pelbu — open your shop',
  description: 'Run your retail shop, wholesale business or distribution network on Pelbu — AI POS, GST compliance, and an online marketplace in one.',
}

const PLANS = [
  { icon: Store, role: 'Retailer', body: 'Run the counter, sell online, and stay GST-compliant.', href: '/signup/retailer', cta: 'Open a retail shop' },
  { icon: Building2, role: 'Wholesaler', body: 'Supply retailers, manage credit and warehouse stock.', href: '/signup/wholesaler', cta: 'Wholesaler account' },
  { icon: Truck, role: 'Distributor', body: 'Move goods across the tier with bulk packages and B2B ordering.', href: '/signup/distributor', cta: 'Distributor account' },
]

const STEPS = [
  { n: '1', title: 'Create your account', body: 'Pick your role and sign up in minutes with just an email and password.' },
  { n: '2', title: 'Add your catalog', body: 'Import products and opening stock from Excel, or let AI enrich them with descriptions and images.' },
  { n: '3', title: 'Start selling', body: 'Sell at the counter and online from one catalog — receipts, GST and stock handled for you.' },
]

const BENEFITS = [
  { icon: ScanLine, title: 'AI-vision & offline POS', body: 'A 4K terminal that recognises products and keeps selling through outages.' },
  { icon: ShoppingBag, title: 'Free marketplace listing', body: 'Reach customers online — pickup or delivery, from the same catalog.' },
  { icon: ReceiptText, title: 'GST 2026, automatic', body: 'Flat 5% on every line, digital signatures, one-click reports.' },
]

export default function SellPage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pt-10 sm:pt-16">
        <div className="relative overflow-hidden rounded-3xl border border-border">
          <img src="/marketing/hero-sell.webp" alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-foreground/90 via-foreground/70 to-foreground/20" />
          <div className="relative max-w-xl px-6 py-16 sm:px-12 sm:py-24">
            <span className="text-xs font-semibold uppercase tracking-wide text-primary">Sell on Pelbu</span>
            <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-background sm:text-5xl">
              Grow your business on one platform
            </h1>
            <p className="mt-4 text-lg text-background/80">
              Whether you run a corner shop, a wholesale depot or a distribution network — Pelbu gives you
              the POS, the compliance and the online storefront to sell more.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup/retailer"><Button size="lg">Open a shop</Button></Link>
              <Link href="/contact">
                <Button size="lg" variant="outline" className="border-background/30 bg-transparent text-background hover:bg-background/10 hover:text-background">
                  Request a demo
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-6 sm:grid-cols-3">
          {BENEFITS.map(({ icon: Icon, title, body }) => (
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

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 pb-8">
        <h2 className="text-3xl font-bold tracking-tight">Up and running in three steps</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {STEPS.map(s => (
            <div key={s.n} className="rounded-2xl border border-border bg-card p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-lg font-bold text-background">
                {s.n}
              </div>
              <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Choose account */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight">Choose your account</h2>
          <p className="mt-3 text-muted-foreground">Every tier of the supply chain has a home on Pelbu.</p>
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {PLANS.map(({ icon: Icon, role, body, href, cta }) => (
            <div key={role} className="flex flex-col rounded-2xl border border-border bg-card p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mt-4 text-xl font-semibold">{role}</h3>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{body}</p>
              <Link href={href} className="mt-5"><Button className="w-full">{cta}</Button></Link>
            </div>
          ))}
        </div>
      </section>

      <CtaBand
        title="Bring your whole shop online"
        body="Create your account today — no credit card, no lock-in. Sell in-store and online from one place."
        primary={{ label: 'Get started free', href: '/signup/retailer' }}
      />
    </>
  )
}
