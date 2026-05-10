'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getUser, getRoleClaims } from '@/lib/auth'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UserPlus, Trash2, Loader2, ArrowLeft, ShieldCheck } from 'lucide-react'
import { CreateTeamMemberModal } from '@/components/admin/create-team-member-modal'

const SUB_ROLE_STYLES = {
  OWNER:   'bg-primary/10 text-primary border-primary/20',
  MANAGER: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  CASHIER: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  STAFF:   'bg-muted text-muted-foreground border-border',
}

export default function TeamPage() {
  const router = useRouter()
  const [team,      setTeam]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [subRole,   setSubRole]   = useState(null)

  useEffect(() => {
    async function init() {
      const user = await getUser()
      if (!user) { router.push('/login'); return }

      const { role, subRole: sr } = getRoleClaims(user)
      if (role === 'RETAILER' && sr !== 'OWNER') { router.push('/pos'); return }
      setSubRole(sr)

      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      const res = await fetch('/api/admin/team', {
        headers: { authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      if (data.team) setTeam(data.team)
      setLoading(false)
    }
    init()
  }, [router])

  async function handleDelete(memberId) {
    if (!confirm('Remove this team member?')) return
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/admin/team/${memberId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${session.access_token}` },
    })
    const data = await res.json()
    if (!res.ok) { alert(data.error); return }
    setTeam(prev => prev.filter(m => m.id !== memberId))
  }

  async function handleChangeRole(memberId, newSubRole) {
    if (newSubRole === 'OWNER' && !confirm(`Transfer ownership to this member? You will become a Manager.`)) return
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/admin/team/${memberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ sub_role: newSubRole }),
    })
    const data = await res.json()
    if (!res.ok) { alert(data.error); return }
    // Reload to reflect new ownership
    window.location.reload()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const isOwner = subRole === 'OWNER'

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-bold">Team Members</h1>
        {isOwner && (
          <Button onClick={() => setModalOpen(true)} className="ml-auto gap-2">
            <UserPlus className="h-4 w-4" /> Add Member
          </Button>
        )}
      </header>

      <main className="p-6 max-w-4xl mx-auto">
        {team.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <UserPlus className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No team members yet.</p>
          </div>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium">Role</th>
                  {isOwner && <th className="px-4 py-3 text-right font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {team.map(member => (
                  <tr key={member.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{member.full_name || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{member.email}</td>
                    <td className="px-4 py-3">
                      {isOwner && member.sub_role !== 'OWNER' ? (
                        <select
                          value={member.sub_role}
                          onChange={e => handleChangeRole(member.id, e.target.value)}
                          className="text-xs border border-input rounded-md px-2 py-1 bg-background"
                        >
                          <option value="MANAGER">Manager</option>
                          <option value="CASHIER">Cashier</option>
                          <option value="STAFF">Staff</option>
                          <option value="OWNER">Owner (transfer)</option>
                        </select>
                      ) : (
                        <Badge variant="outline" className={`text-xs ${SUB_ROLE_STYLES[member.sub_role] || ''}`}>
                          {member.sub_role}
                        </Badge>
                      )}
                    </td>
                    {isOwner && (
                      <td className="px-4 py-3 text-right">
                        {member.sub_role !== 'OWNER' && (
                          <button
                            onClick={() => handleDelete(member.id)}
                            className="text-muted-foreground hover:text-tibetan transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <CreateTeamMemberModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={member => setTeam(prev => [...prev, member])}
      />
    </div>
  )
}
