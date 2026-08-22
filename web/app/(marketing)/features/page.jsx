import Link from 'next/link'
import { CtaBand } from '@/components/marketing/cta-band'
import { PILLARS } from '@/lib/marketing/content'
import { ArrowRight } from 'lucide-react'

export const metadata = {
  title: 'Features — Pelbu',
  description: 'AI-vision POS, consumer marketplace, GST 2026 compliance and a multi-tier B2B supply chain — everything Pelbu does, in one place.',
}

export default function FeaturesHub() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pt-14 pb-6 text-center">
        <span className="text-xs font-semibold uppercase tracking-wide text-primary">Features</span>
        <h1 className="mx-auto mt-3 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          Everything a Bhutanese business needs, in one platform
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          From the shop counter to government filing to the marketplace and last-mile delivery —
          explore the four pillars of Pelbu.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid gap-6 md:grid-cols-2">
          {PILLARS.map(p => (
            <Link
              key={p.slug}
              href={`/features/${p.slug}`}
              className="group overflow-hidden rounded-2xl border border-border bg-card transition-all hover:border-primary/40 hover:shadow-lg"
            >
              <div className="relative h-44 w-full">
                <img src={p.hero} alt="" className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 to-transparent" />
                <span className="absolute bottom-3 left-4 text-xs font-semibold uppercase tracking-wide text-background">
                  {p.eyebrow}
                </span>
              </div>
              <div className="p-6">
                <h2 className="text-xl font-semibold">{p.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{p.tagline}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-foreground">
                  Learn more
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <CtaBand />
    </>
  )
}
