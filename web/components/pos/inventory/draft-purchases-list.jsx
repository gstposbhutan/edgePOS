"use client"

import { Camera, FileText, ShoppingBag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

/**
 * List of draft purchases with status badges and actions.
 *
 * @param {{
 *   drafts: object[],
 *   loading: boolean,
 *   onSelectDraft: (draft: object) => void,
 *   onScanBill: () => void
 * }} props
 */
export function DraftPurchasesList({ drafts, loading, onSelectDraft, onScanBill }) {
  const statusStyles = {
    DRAFT:     'bg-slate-500/10 text-slate-600 border-slate-500/20',
    REVIEWED:  'bg-amber-500/10 text-amber-600 border-amber-500/20',
    CONFIRMED: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    CANCELLED: 'bg-tibetan/10 text-tibetan border-tibetan/20',
  }

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Scan Bill button */}
      <Button onClick={onScanBill}
        className="w-full bg-primary hover:bg-primary/90 text-black font-semibold h-11">
        <Camera className="mr-2 h-4 w-4" /> Scan Bill
      </Button>

      {drafts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
          <FileText className="h-10 w-10 opacity-20" />
          <p className="text-sm">No draft purchases yet</p>
          <p className="text-xs">Scan a wholesale bill to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {drafts.map(draft => {
            const itemCount = draft.draft_purchase_items?.length ?? 0
            const matchedCount = draft.draft_purchase_items?.filter(i => i.product_id && i.match_status !== 'UNMATCHED').length ?? 0
            const isEditable = ['DRAFT', 'REVIEWED'].includes(draft.status)

            return (
              <button
                key={draft.id}
                onClick={() => isEditable ? onSelectDraft(draft) : null}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border border-border bg-card transition-colors text-left ${
                  isEditable ? 'hover:bg-muted/30' : 'opacity-60 cursor-default'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge className={`text-[10px] ${statusStyles[draft.status] || statusStyles.DRAFT}`}>
                      {draft.status}
                    </Badge>
                    {draft.supplier_name && (
                      <span className="text-xs font-medium text-foreground truncate">{draft.supplier_name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                    <span>{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
                    {matchedCount < itemCount && isEditable && (
                      <span className="text-amber-600">{itemCount - matchedCount} unmatched</span>
                    )}
                    <span>{new Date(draft.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-primary">
                    Nu. {parseFloat(draft.total_amount || 0).toFixed(2)}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
