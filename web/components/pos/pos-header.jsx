"use client"

import { useState } from "react"
import { LogOut, RefreshCw, Wifi, Package, BookOpen, ClipboardList, Wallet, ShoppingBag, Keyboard, ChevronDown, Store, LayoutDashboard, ShoppingCart, Landmark, MonitorDown, Banknote, ReceiptText, History } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/ui/logo"
import { FaceAuthBadge } from "./face-auth-badge"
import { ShiftStatusBadge } from "./shift/shift-status-badge"
import { HandoverModal } from "./handover-modal"
import { signOut } from "@/lib/auth"
import { useRouter } from "next/navigation"

/**
 * @param {{ storeName: string, cashierName: string, customer: object|null, syncing: boolean,
 *   onEnrollFace: fn, onRestock: fn, userSubRole: string, faceCamera: ReactNode,
 *   ownedStores?: object[], onSwitchStore?: (entityId: string) => void,
 *   shift?: object|null, currentUserId?: string|null, onStartShift?: fn, onEndShift?: fn,
 *   onCashAdj?: fn, onZReport?: fn }} props
 */
export function PosHeader({ storeName, cashierName, customer, syncing, onEnrollFace, onRestock, userSubRole, faceCamera, ownedStores = [], onSwitchStore, shift, currentUserId, onCloseShiftAndSignOut, onStartShift, onEndShift, onCashAdj, onZReport }) {
  const router = useRouter()
  const [storeMenuOpen, setStoreMenuOpen] = useState(false)
  const [showHandover, setShowHandover] = useState(false)

  async function handleSignOut() {
    // An open shift can never be silently orphaned by a logout — prompt the cashier
    // to close it or hand the register to a teammate first.
    if (shift) { setShowHandover(true); return }
    await signOut()
    router.push('/login')
  }

  // "Close shift & sign out" → run the parent's end-shift flow. Prefer the
  // sign-out-aware handler (parent counts the drawer, closes the shift, then signs
  // out); fall back to a plain end-shift if a host doesn't provide it.
  function handleCloseShift() {
    setShowHandover(false)
    if (onCloseShiftAndSignOut) onCloseShiftAndSignOut()
    else onEndShift?.()
  }

  const isOwner = userSubRole === 'OWNER'
  const hasMultipleStores = isOwner && ownedStores.length > 1

  return (
    <header className="glassmorphism border-b border-border px-4 py-3 flex items-center justify-between gap-4 shrink-0">
      {/* Left — branding + store selector */}
      <div className="flex items-center gap-3">
        <Logo variant="icon" className="h-8 w-8 rounded-lg shrink-0" />

        {hasMultipleStores ? (
          <div className="relative hidden sm:block">
            <button
              onClick={() => setStoreMenuOpen(v => !v)}
              className="flex items-center gap-1.5 hover:bg-muted/50 rounded-lg px-2 py-1 transition-colors"
            >
              <div>
                <p className="text-sm font-serif font-bold text-foreground leading-none">{storeName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{cashierName}</p>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>

            {storeMenuOpen && (
              <div className="absolute left-0 top-full mt-1 w-56 bg-background border border-border rounded-xl shadow-lg z-50 overflow-hidden">
                <p className="px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">
                  Switch Store
                </p>
                {ownedStores.map(store => (
                  <button
                    key={store.id}
                    onClick={() => { onSwitchStore?.(store.id); setStoreMenuOpen(false) }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors text-left ${
                      store.name === storeName ? 'text-primary font-medium' : ''
                    }`}
                  >
                    <Store className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{store.name}</span>
                    {store.name === storeName && <span className="ml-auto text-[10px] text-primary">Active</span>}
                  </button>
                ))}
                <div className="border-t border-border">
                  <button
                    onClick={() => { setStoreMenuOpen(false); router.push('/admin') }}
                    className="w-full px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 text-left transition-colors"
                  >
                    Manage stores →
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="hidden sm:block">
            <p className="text-sm font-serif font-bold text-foreground leading-none">{storeName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{cashierName}</p>
          </div>
        )}
      </div>

      {/* Center — face camera + customer identity */}
      <div className="flex items-center gap-3">
        {faceCamera}
        <div className="flex flex-col gap-1">
          <FaceAuthBadge customer={customer} />
          {!customer?.buyerHash && onEnrollFace && (
            <button
              onClick={onEnrollFace}
              className="text-[10px] text-primary hover:underline underline-offset-2 text-left"
            >
              + Enroll Face-ID
            </button>
          )}
        </div>
      </div>

      {/* Right — nav + actions */}
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="border-emerald-500 text-emerald-600 hidden sm:flex">
          <Wifi className="h-3 w-3 mr-1" /> Online
        </Badge>

        {syncing && (
          <Badge variant="outline" className="border-primary text-primary">
            <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Syncing
          </Badge>
        )}

        {userSubRole === 'OWNER' && (
          <Button variant="ghost" size="icon-sm" onClick={() => router.push('/admin/stores')} title="Manage Stores">
            <LayoutDashboard className="h-4 w-4" />
          </Button>
        )}

        {userSubRole === 'OWNER' && (
          <Button variant="ghost" size="icon-sm" onClick={() => router.push('/downloads')} title="Desktop App & Updates">
            <MonitorDown className="h-4 w-4" />
          </Button>
        )}

        <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos/orders')} title="Orders">
          <ClipboardList className="h-4 w-4" />
        </Button>

        {userSubRole !== 'CASHIER' && (
          <>
            <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos/purchases')} title="Purchases">
              <ShoppingCart className="h-4 w-4" />
            </Button>

            <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos/products')} title="Products">
              <BookOpen className="h-4 w-4" />
            </Button>

            <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos/inventory')} title="Inventory">
              <Package className="h-4 w-4" />
            </Button>

            <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos/khata')} title="Khata (Credit)">
              <Wallet className="h-4 w-4" />
            </Button>

            <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos/registers')} title="Cash Registers">
              <Landmark className="h-4 w-4" />
            </Button>
          </>
        )}

        {['MANAGER', 'OWNER'].includes(userSubRole) && (
          <Button variant="ghost" size="icon-sm" onClick={onRestock} title="Restock from Wholesaler" data-testid="restock-btn">
            <ShoppingBag className="h-4 w-4" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon-sm"
          title="Switch to Keyboard Mode (F9)"
          onClick={() => { localStorage.setItem('pos_layout_mode', 'keyboard'); router.push('/pos') }}
        >
          <Keyboard className="h-4 w-4" />
        </Button>

        {['MANAGER', 'OWNER', 'ADMIN'].includes(userSubRole) && (
          <>
            {onCashAdj && (
              <Button variant="ghost" size="icon-sm" onClick={onCashAdj} title="Cash In/Out">
                <Banknote className="h-4 w-4" />
              </Button>
            )}
            {onZReport && (
              <Button variant="ghost" size="icon-sm" onClick={onZReport} title="Z-Report">
                <ReceiptText className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos/shifts')} title="Shift history">
              <History className="h-4 w-4" />
            </Button>
          </>
        )}

        <ShiftStatusBadge shift={shift} onStart={onStartShift} onEnd={onEndShift} />

        <Button variant="ghost" size="icon-sm" onClick={handleSignOut} title="Sign out">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>

      <HandoverModal
        open={showHandover}
        currentUserId={currentUserId}
        onCloseShift={handleCloseShift}
        onClose={() => setShowHandover(false)}
      />
    </header>
  )
}
