"use client"

import { LogOut, RefreshCw, Wifi, Package, BookOpen, ClipboardList } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FaceAuthBadge } from "./face-auth-badge"
import { signOut } from "@/lib/auth"
import { useRouter } from "next/navigation"

/**
 * @param {{ storeName: string, cashierName: string, customer: object|null, syncing: boolean }} props
 */
export function PosHeader({ storeName, cashierName, customer, syncing }) {
  const router = useRouter()

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  return (
    <header className="glassmorphism border-b border-border px-4 py-3 flex items-center justify-between gap-4 shrink-0">
      {/* Left — branding + store */}
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <span className="text-sm">🏔️</span>
        </div>
        <div className="hidden sm:block">
          <p className="text-sm font-serif font-bold text-foreground leading-none">{storeName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{cashierName}</p>
        </div>
      </div>

      {/* Center — customer identity */}
      <FaceAuthBadge customer={customer} />

      {/* Right — status + actions */}
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="border-emerald-500 text-emerald-600 hidden sm:flex">
          <Wifi className="h-3 w-3 mr-1" /> Online
        </Badge>

        {syncing && (
          <Badge variant="outline" className="border-primary text-primary">
            <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Syncing
          </Badge>
        )}

        <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos/orders')} title="Orders">
          <ClipboardList className="h-4 w-4" />
        </Button>

        <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos/products')} title="Products">
          <BookOpen className="h-4 w-4" />
        </Button>

        <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos/inventory')} title="Inventory">
          <Package className="h-4 w-4" />
        </Button>

        <Button variant="ghost" size="icon-sm" onClick={handleSignOut} title="Sign out">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
