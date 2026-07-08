"use client"

import { useEffect, useState } from "react"
import { ArrowLeft, Mail, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function RiderProfilePage() {
  const [rider, setRider] = useState(null)

  useEffect(() => {
    fetch('/api/rider/orders')
      .then(r => r.json())
      .then(d => setRider(d.rider || null))
      .catch(() => {})
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center gap-3">
        <Link href="/rider">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <h1 className="font-semibold">Profile</h1>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-4">
        {rider && (
          <div className="border border-border rounded-xl p-4">
            <p className="text-lg font-semibold">{rider.name}</p>
          </div>
        )}

        <div className="border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" /> How you sign in
          </div>
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Mail className="h-4 w-4 mt-0.5 shrink-0" />
            <p>You sign in with your email. A fresh 6-digit code is emailed each time — there's no password to remember. To change your email, contact your admin.</p>
          </div>
        </div>
      </main>
    </div>
  )
}
