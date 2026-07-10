'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ScanLine, ClipboardList, BookOpen, Package, ShoppingCart, Wallet, Landmark,
  Clock, Users, Store, Settings, MonitorDown, FileBarChart, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import { Logo } from '@/components/ui/logo'

// Page navigation for the POS console (top bar keeps actions only). Items are filtered by the
// signed-in user's sub_role. Collapses to a slim icon rail; expands to icon + label.
const NAV = [
  { href: '/pos',           label: 'Register',      icon: ScanLine,      show: () => true, exact: true },
  { href: '/pos/orders',    label: 'Orders',        icon: ClipboardList, show: () => true },
  { href: '/pos/products',  label: 'Products',      icon: BookOpen,      show: r => r !== 'CASHIER' },
  { href: '/pos/inventory', label: 'Inventory',     icon: Package,       show: r => r !== 'CASHIER' },
  { href: '/pos/purchases', label: 'Purchases',     icon: ShoppingCart,  show: r => r !== 'CASHIER' },
  { href: '/pos/khata',     label: 'Khata',         icon: Wallet,        show: r => r !== 'CASHIER' },
  { href: '/pos/registers', label: 'Cash Registers', icon: Landmark,     show: r => r !== 'CASHIER' },
  { href: '/pos/shifts',    label: 'Shifts',        icon: Clock,         show: r => ['MANAGER', 'OWNER', 'ADMIN'].includes(r) },
  { href: '/pos/reports',   label: 'GST Report',    icon: FileBarChart,  show: r => ['MANAGER', 'OWNER', 'ADMIN'].includes(r) },
  { href: '/pos/team',      label: 'Team',          icon: Users,         show: r => r === 'OWNER' },
  { href: '/pos/stores',    label: 'Stores',        icon: Store,         show: r => r === 'OWNER' },
  { href: '/pos/settings',  label: 'Settings',      icon: Settings,      show: r => ['MANAGER', 'OWNER', 'ADMIN'].includes(r) },
  { href: '/downloads',     label: 'Desktop App',   icon: MonitorDown,   show: r => r === 'OWNER' },
]

export function PosSidebar() {
  const pathname = usePathname()
  const [subRole, setSubRole] = useState(null)
  const [collapsed, setCollapsed] = useState(true)

  useEffect(() => {
    try { const s = localStorage.getItem('pos_sidebar_collapsed'); if (s != null) setCollapsed(s === '1') } catch {}
    fetch('/api/auth/session').then(r => r.ok ? r.json() : null).then(d => setSubRole(d?.user?.subRole || 'CASHIER')).catch(() => setSubRole('CASHIER'))
  }, [])

  function toggle() {
    setCollapsed(c => { const n = !c; try { localStorage.setItem('pos_sidebar_collapsed', n ? '1' : '0') } catch {} return n })
  }

  if (subRole === null) return <aside className="w-14 shrink-0 border-r border-border bg-background" />
  const items = NAV.filter(i => i.show(subRole))

  return (
    <aside className={`${collapsed ? 'w-14' : 'w-52'} shrink-0 border-r border-border bg-background flex flex-col transition-[width] duration-150`}>
      <div className={`h-12 flex items-center border-b border-border ${collapsed ? 'justify-center' : 'px-3'}`}>
        {collapsed ? <Logo variant="icon" className="h-6 w-6" /> : <Logo variant="horizontal" className="h-6 w-auto" />}
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {items.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : (pathname === href || pathname.startsWith(href + '/'))
          return (
            <Link key={href} href={href} title={collapsed ? label : undefined}
              className={`flex items-center gap-3 mx-1.5 my-0.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                active ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              } ${collapsed ? 'justify-center' : ''}`}>
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          )
        })}
      </nav>

      <button onClick={toggle} title={collapsed ? 'Expand' : 'Collapse'}
        className={`h-10 flex items-center gap-3 border-t border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 ${collapsed ? 'justify-center' : 'px-3'}`}>
        {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <><PanelLeftClose className="h-5 w-5" /> <span className="text-sm">Collapse</span></>}
      </button>
    </aside>
  )
}
