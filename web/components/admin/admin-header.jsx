'use client'

import { Building2, LogOut, Menu } from 'lucide-react'
import { signOut } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'

const SUB_ROLE_STYLES = {
  OWNER: 'bg-primary/10 text-primary border-primary/20',
  MANAGER: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  STAFF: 'bg-muted text-muted-foreground border-border',
}

export function AdminHeader({ businessName, userName, subRole }) {
  const router = useRouter()

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  return (
    <header className="h-14 border-b border-border bg-card/50 flex items-center justify-between px-4">
      {/* Left: business name */}
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center md:hidden">
          <Building2 className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
        <span className="font-serif font-bold text-foreground text-sm">{businessName || 'Admin'}</span>
      </div>

      {/* Right: user info + sign out */}
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{userName}</span>
          <Badge variant="outline" className={`text-xs ${SUB_ROLE_STYLES[subRole] || ''}`}>
            {subRole}
          </Badge>
        </div>
        <button
          onClick={handleSignOut}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}
