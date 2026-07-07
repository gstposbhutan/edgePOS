import Link from 'next/link'
import { Button } from '@/components/ui/button'

/** Full-width call-to-action band. Reused at the foot of every marketing page. */
export function CtaBand({
  title = 'Ready to run your shop on Pelbu?',
  body = 'Set up in minutes — sell in-store and online, stay GST-compliant, and keep selling even offline.',
  primary = { label: 'Get started', href: '/sell' },
  secondary = { label: 'Talk to us', href: '/contact' },
}) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <div className="relative overflow-hidden rounded-3xl bg-foreground px-6 py-14 text-center sm:px-12">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-emerald-500/20 blur-3xl" />
        <h2 className="relative text-2xl font-bold tracking-tight text-background sm:text-3xl">{title}</h2>
        <p className="relative mx-auto mt-3 max-w-xl text-background/70">{body}</p>
        <div className="relative mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link href={primary.href}><Button size="lg">{primary.label}</Button></Link>
          {secondary && (
            <Link href={secondary.href}>
              <Button size="lg" variant="outline" className="border-background/30 bg-transparent text-background hover:bg-background/10 hover:text-background">
                {secondary.label}
              </Button>
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}
