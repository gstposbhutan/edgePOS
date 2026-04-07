"use client"

import { User, CheckCircle } from "lucide-react"

/**
 * Floating badge showing customer identification status.
 * Grey = no customer identified, Gold = Face-ID matched, Blue = WhatsApp captured.
 *
 * @param {{ whatsapp: string|null, buyerHash: string|null }} customer
 */
export function FaceAuthBadge({ customer }) {
  const identified = customer?.whatsapp || customer?.buyerHash
  const isFaceId   = !!customer?.buyerHash

  return (
    <div className={`
      flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-300
      ${identified
        ? 'bg-primary/10 border-primary/30 text-primary'
        : 'bg-muted border-border text-muted-foreground'
      }
    `}>
      {identified
        ? <CheckCircle className="h-3.5 w-3.5" />
        : <User className="h-3.5 w-3.5" />
      }
      {identified
        ? isFaceId
          ? 'Face-ID Verified'
          : customer.whatsapp
        : 'No Customer'
      }
    </div>
  )
}
