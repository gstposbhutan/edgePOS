'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signOut } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Building2, LogOut } from 'lucide-react'

/**
 * Shared layout for the distributor / wholesaler consoles.
 *
 * Header carries the business/entity name + role label + sign-out; a section nav lists the
 * console's tiles. Enabled items are real links; the rest render as visibly-disabled
 * "coming soon" entries so the shell stays complete without dead links.
 *
 * Props:
 *   title    — console heading, e.g. "Distributor Console"
 *   name     — business / signed-in entity name (subtitle)
 *   nav      — [{ key, label, href, icon, enabled }]
 *   active   — key of the current section (highlighted in the nav)
 *   children — section content
 */
export function ConsoleShell({ title, name, nav = [], active, children }) {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center gap-3">
        <Link href="/" className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center" aria-label="Home">
          <Building2 className="h-4 w-4 text-primary-foreground" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif font-bold truncate">{title}</h1>
          {name && <p className="text-xs text-muted-foreground truncate">{name}</p>}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => { await signOut(); router.push('/login') }}
          className="gap-2"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </header>

      <div className="flex flex-col md:flex-row max-w-6xl mx-auto">
        {nav.length > 0 && (
          <nav className="md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-border p-3 md:py-6">
            <ul className="flex md:flex-col gap-1 overflow-x-auto">
              {nav.map(({ key, label, href, icon: Icon, enabled }) => {
                const isActive = key === active
                const base = 'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap'

                if (!enabled) {
                  return (
                    <li key={key}>
                      <span className={`${base} text-muted-foreground/60 cursor-not-allowed`} title="Coming soon">
                        {Icon && <Icon className="h-4 w-4 shrink-0" />}
                        <span className="truncate">{label}</span>
                        <span className="ml-auto hidden md:inline text-[10px] border border-border rounded-full px-1.5 py-0.5">Soon</span>
                      </span>
                    </li>
                  )
                }

                return (
                  <li key={key}>
                    <Link
                      href={href}
                      aria-current={isActive ? 'page' : undefined}
                      className={`${base} transition-colors ${
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-foreground hover:bg-muted/50'
                      }`}
                    >
                      {Icon && <Icon className="h-4 w-4 shrink-0" />}
                      <span className="truncate">{label}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>
        )}

        <main className="flex-1 p-6 min-w-0">{children}</main>
      </div>
    </div>
  )
}
