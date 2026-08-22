import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { CtaBand } from '@/components/marketing/cta-band'
import { PILLARS, pillar } from '@/lib/marketing/content'
import { Check, ArrowRight } from 'lucide-react'

export function generateStaticParams() {
  return PILLARS.map(p => ({ slug: p.slug }))
}

export async function generateMetadata({ params }) {
  const { slug } = await params
  const p = PILLARS.find(x => x.slug === slug)
  if (!p) return {}
  return { title: `${p.eyebrow} — Pelbu`, description: p.tagline }
}

export default async function PillarPage({ params }) {
  const { slug } = await params
  const p = pillar(slug)
  if (!p) notFound()
  const others = PILLARS.filter(x => x.slug !== p.slug)

  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pt-10 sm:pt-16">
        <div className="relative overflow-hidden rounded-3xl border border-border">
          <img src={p.hero} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-foreground/90 via-foreground/70 to-foreground/20" />
          <div className="relative max-w-xl px-6 py-16 sm:px-12 sm:py-24">
            <span className="text-xs font-semibold uppercase tracking-wide text-primary">{p.eyebrow}</span>
            <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-background sm:text-5xl">
              {p.title}
            </h1>
            <p className="mt-4 text-lg text-background/80">{p.tagline}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/sell"><Button size="lg">Get started</Button></Link>
              <Link href="/contact">
                <Button size="lg" variant="outline" className="border-background/30 bg-transparent text-background hover:bg-background/10 hover:text-background">
                  Talk to us
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Highlights (illustrated) */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-6 sm:grid-cols-2">
          {p.highlights.map(h => (
            <div key={h.title} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex items-center justify-center bg-muted/40 p-6">
                <img src={h.spot} alt="" className="h-40 w-40 object-contain" />
              </div>
              <div className="p-6">
                <h3 className="text-lg font-semibold">{h.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{h.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Everything included */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="rounded-3xl border border-border bg-card p-8 sm:p-12">
          <h2 className="text-2xl font-bold tracking-tight">What&apos;s included</h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {p.bullets.map(b => (
              <li key={b} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                </span>
                <span className="text-sm">{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Explore other pillars */}
      <section className="mx-auto max-w-6xl px-4 pb-4">
        <h2 className="text-xl font-semibold">Explore more</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {others.map(o => (
            <Link
              key={o.slug}
              href={`/features/${o.slug}`}
              className="group flex items-center justify-between rounded-xl border border-border bg-card px-5 py-4 transition-colors hover:border-primary/40"
            >
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-primary">{o.eyebrow}</div>
                <div className="mt-1 text-sm font-medium">{o.title}</div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </Link>
          ))}
        </div>
      </section>

      <CtaBand />
    </>
  )
}
