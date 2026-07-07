"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// The standalone sales-order screen has been folded into the POS register: build a cart
// there and use "Save as draft" (Alt+Q) → Sales Order or Quotation. This route now just
// redirects, so any old links/bookmarks still land in the right place.
export default function SalesOrderRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/pos') }, [router])
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
