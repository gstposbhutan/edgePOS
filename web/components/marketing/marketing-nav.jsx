'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Logo } from '@/components/ui/logo'
import { Button } from '@/components/ui/button'
import { NAV } from '@/lib/marketing/content'
import { getUser, getRoleClaims } from '@/lib/auth'
import { Menu, X, LayoutDashboard } from 'lucide-react'

// Where each role's "home" lives (mirrors proxy.js ROLE_HOME).
const ROLE_HOME = {
  SUPER_ADMIN: '/admin',
  DISTRIBUTOR: '/distributor',
  WHOLESALER: '/wholesaler',
  RETAILER: '/pos',
  RIDER: '/rider',
  CUSTOMER: '/shop',
}

export function MarketingNav() {
  const [open, setOpen] = useState(false)
  // undefined = still checking, null = logged out, object = logged in
  const [account, setAccount] = useState(undefined)

  useEffect(() => {
    let alive = true
    getUser().then(user => {
      if (!alive) return
      if (!user) { setAccount(null); return }
      const { role } = getRoleClaims(user) || {}
      setAccount({
        href: ROLE_HOME[role] || '/shop',
        label: role === 'CUSTOMER' ? 'My account' : 'Dashboard',
      })
    }).catch(() => alive && setAccount(null))
    return () => { alive = false }
  }, [])

  // Right-hand actions, shared by desktop + mobile.
  function Actions({ stacked = false }) {
    const wrap = stacked ? 'flex gap-2' : 'flex items-center gap-2'
    if (account === undefined) return <div className="h-9 w-24" aria-hidden />   // reserve space, no flash
    if (account) {
      return (
        <div className={wrap}>
          <Link href={account.href} className={stacked ? 'flex-1' : ''}>
            <Button size={stacked ? 'default' : 'sm'} className={stacked ? 'w-full' : ''}>
              <LayoutDashboard className="h-4 w-4" /> {account.label}
            </Button>
          </Link>
        </div>
      )
    }
    return (
      <div className={wrap}>
        <Link href="/login" className={stacked ? 'flex-1' : ''}>
          <Button variant={stacked ? 'outline' : 'ghost'} size={stacked ? 'default' : 'sm'} className={stacked ? 'w-full' : ''}>Log in</Button>
        </Link>
        <Link href="/sell" className={stacked ? 'flex-1' : ''}>
          <Button size={stacked ? 'default' : 'sm'} className={stacked ? 'w-full' : ''}>Get started</Button>
        </Link>
      </div>
    )
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center" aria-label="Pelbu home">
          <Logo variant="horizontal" className="h-8 w-auto" />
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:flex">
          <Actions />
        </div>

        <button
          className="rounded-lg p-2 text-foreground md:hidden"
          onClick={() => setOpen(v => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-border bg-background md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
            {NAV.map(item => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-2" onClick={() => setOpen(false)}>
              <Actions stacked />
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
