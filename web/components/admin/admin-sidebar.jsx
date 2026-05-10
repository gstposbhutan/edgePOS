'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, Settings, LogOut, Building2, Ruler, FolderTree, Bike, Store } from 'lucide-react'
import { signOut, getUser, getRoleClaims } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

// roles: null = all, array = allowed sub_roles / roles
const NAV_ITEMS = [
  { href: '/admin',            label: 'Dashboard',  icon: LayoutDashboard, roles: null },
  { href: '/admin/stores',     label: 'Stores',     icon: Store,           roles: null },
  { href: '/admin/team',       label: 'Team',       icon: Users,           roles: null },
  { href: '/admin/categories', label: 'Categories', icon: FolderTree,      roles: ['SUPER_ADMIN', 'DISTRIBUTOR'] },
  { href: '/admin/units',      label: 'Units',      icon: Ruler,           roles: ['SUPER_ADMIN', 'DISTRIBUTOR'] },
  { href: '/admin/riders',     label: 'Riders',     icon: Bike,            roles: ['SUPER_ADMIN'] },
  { href: '/admin/settings',   label: 'Settings',   icon: Settings,        roles: null },
]

export function AdminSidebar() {
  const pathname = usePathname()
  const router   = useRouter()
  const [userRole, setUserRole] = useState(null)

  useEffect(() => {
    getUser().then(user => {
      if (user) {
        const { role } = getRoleClaims(user)
        setUserRole(role)
      }
    })
  }, [])

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  const visibleItems = NAV_ITEMS.filter(item =>
    !item.roles || item.roles.includes(userRole)
  )

  return (
    <aside className="hidden md:flex md:w-56 md:flex-col md:fixed md:inset-y-0 border-r border-border bg-card/50">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-border">
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
          <Building2 className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="font-serif font-bold text-foreground text-sm">NEXUS Admin</span>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {visibleItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/admin' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Sign out */}
      <div className="px-2 py-4 border-t border-border">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors w-full"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
