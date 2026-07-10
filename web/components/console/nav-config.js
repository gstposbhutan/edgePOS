import { Store, Building2, Star, Package, Users, Warehouse, Settings, Inbox, Truck, ShoppingCart, FileText } from 'lucide-react'

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
    { key: 'wholesalers', label: 'Wholesalers', href: '/distributor/wholesalers', icon: Store,     enabled: true,  note: 'Browse all · save favourites' },
    { key: 'retailers',   label: 'Retailers',   href: '/distributor/retailers',   icon: Building2, enabled: true,  note: 'Browse all · save favourites' },
    { key: 'saved',       label: 'Saved',       href: '/distributor/saved',       icon: Star,      enabled: true,  note: 'Your favourites' },
    { key: 'sell',        label: 'Sell',        href: '/distributor/sell',        icon: ShoppingCart, enabled: true, note: 'Sell to a wholesaler' },
    { key: 'quotes',      label: 'Quotes & Orders', href: '/distributor/quotes',  icon: FileText,  enabled: true,  note: 'Sales orders & quotations' },
    { key: 'orders',      label: 'Orders',      href: '/distributor/orders',      icon: Inbox,     enabled: true,  note: 'Incoming orders' },
    { key: 'catalog',     label: 'Catalog',     href: '/distributor/catalog',     icon: Package,   enabled: true,  note: 'Your products' },
    { key: 'team',        label: 'Team',        href: '/distributor/team',        icon: Users,     enabled: true,  note: 'Your staff' },
    { key: 'settings',    label: 'Settings',    href: '/distributor/settings',    icon: Settings,  enabled: true,  note: 'Business profile' },
  ]
}

export function wholesalerNav() {
  return [
    { key: 'retailers',  label: 'Retailers',  href: '/wholesaler/retailers',  icon: Store,     enabled: true,  note: 'Browse all · save favourites' },
    { key: 'saved',      label: 'Saved',      href: '/wholesaler/saved',      icon: Star,      enabled: true,  note: 'Your favourites' },
    { key: 'sell',       label: 'Sell',       href: '/wholesaler/sell',       icon: ShoppingCart, enabled: true, note: 'Sell to a retailer' },
    { key: 'quotes',     label: 'Quotes & Orders', href: '/wholesaler/quotes', icon: FileText,  enabled: true,  note: 'Sales orders & quotations' },
    { key: 'orders',     label: 'Orders',     href: '/wholesaler/orders',     icon: Inbox,     enabled: true,  note: 'Incoming orders' },
    { key: 'restock',    label: 'Order supplies', href: '/wholesaler/restock', icon: Truck,    enabled: true,  note: 'Restock from distributors' },
    { key: 'warehouses', label: 'Warehouses', href: '/wholesaler/warehouses', icon: Warehouse, enabled: true,  note: 'Your buildings/depots' },
    { key: 'catalog',    label: 'Catalog',    href: '/wholesaler/catalog',    icon: Package,   enabled: true,  note: 'Your products' },
    { key: 'team',       label: 'Team',       href: '/wholesaler/team',       icon: Users,     enabled: true,  note: 'Your staff' },
    { key: 'settings',   label: 'Settings',   href: '/wholesaler/settings',   icon: Settings,  enabled: true,  note: 'Business profile' },
  ]
}
