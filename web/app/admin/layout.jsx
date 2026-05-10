'use client'

import { useAdminAuth } from '@/hooks/use-admin-auth'
import { AdminSidebar } from '@/components/admin/admin-sidebar'
import { AdminHeader } from '@/components/admin/admin-header'
import { Loader2 } from 'lucide-react'

export default function AdminLayout({ children }) {
  const { user, entityId, role, subRole, loading } = useAdminAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const businessName = user?.user_metadata?.entity_name || user?.app_metadata?.entity_name || 'Admin'
  const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || ''

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AdminSidebar />

      <div className="flex-1 flex flex-col md:ml-56">
        <AdminHeader
          businessName={businessName}
          userName={userName}
          subRole={subRole}
        />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
