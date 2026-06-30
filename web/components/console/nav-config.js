import { Store, Building2, Star, Package, Users, Warehouse, Settings } from 'lucide-react'

/**
 * Section nav for the distributor / wholesaler consoles — the single source of truth shared
 * by the landing pages and the individual section pages (via ConsoleShell). Phase 1 ships
 * Team + Settings; the remaining tiles are placeholders flagged `enabled: false` so they
 * render as "coming soon" without dead links.
 *
 * Each item: { key, label, href, icon, enabled, note }. `note` is the short description the
 * landing-page tiles show.
 */

export function distributorNav() {
  return [
    { key: 'wholesalers', label: 'Wholesalers', href: '/distributor/wholesalers', icon: Store,     enabled: false, note: 'Browse all · save favourites' },
    { key: 'retailers',   label: 'Retailers',   href: '/distributor/retailers',   icon: Building2, enabled: false, note: 'Browse all · save favourites' },
    { key: 'saved',       label: 'Saved',       href: '/distributor/saved',       icon: Star,      enabled: false, note: 'Your favourites' },
    { key: 'catalog',     label: 'Catalog',     href: '/distributor/catalog',     icon: Package,   enabled: false, note: 'Your products' },
    { key: 'team',        label: 'Team',        href: '/distributor/team',        icon: Users,     enabled: true,  note: 'Your staff' },
    { key: 'settings',    label: 'Settings',    href: '/distributor/settings',    icon: Settings,  enabled: true,  note: 'Business profile' },
  ]
}

export function wholesalerNav() {
  return [
    { key: 'retailers',  label: 'Retailers',  href: '/wholesaler/retailers',  icon: Store,     enabled: false, note: 'Browse all · save favourites' },
    { key: 'saved',      label: 'Saved',      href: '/wholesaler/saved',      icon: Star,      enabled: false, note: 'Your favourites' },
    { key: 'warehouses', label: 'Warehouses', href: '/wholesaler/warehouses', icon: Warehouse, enabled: false, note: 'Your buildings/depots' },
    { key: 'catalog',    label: 'Catalog',    href: '/wholesaler/catalog',    icon: Package,   enabled: false, note: 'Your products' },
    { key: 'team',       label: 'Team',       href: '/wholesaler/team',       icon: Users,     enabled: true,  note: 'Your staff' },
    { key: 'settings',   label: 'Settings',   href: '/wholesaler/settings',   icon: Settings,  enabled: true,  note: 'Business profile' },
  ]
}
