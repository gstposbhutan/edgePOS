'use client'

import { useState, useEffect } from 'react'
import { getUser, getRoleClaims } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UserPlus, Trash2, Loader2, KeyRound, Bell, BellOff } from 'lucide-react'
import { CreateTeamMemberModal } from '@/components/admin/create-team-member-modal'

const SUB_ROLE_STYLES = {
  OWNER:   'bg-primary/10 text-primary border-primary/20',
  MANAGER: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  CASHIER: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  STAFF:   'bg-muted text-muted-foreground border-border',
}

/**
 * Reusable team-management surface — the single source of truth for staff CRUD across the
 * retailer POS (/pos/team) and the distributor/wholesaler consoles. Talks only to the
 * role-agnostic /api/admin/team endpoints, which scope to the caller's entity and gate
 * mutations on the OWNER sub_role, so this works unchanged for any business role.
 *
 * It owns the member table, the "Add Member" action, and the row controls (change role,
 * reset password, remove). Page chrome (headers, back buttons) stays with the host page.
 *
 * Props:
 *   title — optional heading rendered above the toolbar (omit if the host shows its own).
 */
export function TeamManager({ title }) {
  const [team,      setTeam]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [subRole,   setSubRole]   = useState(null)

  useEffect(() => {
    async function init() {
      // Owner-gating is enforced server-side; mirror it here so non-owners get a read-only list.
      const user = await getUser()
      setSubRole(getRoleClaims(user).subRole)

      const res = await fetch('/api/admin/team')
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to load team'); setLoading(false); return }
      if (data.team) setTeam(data.team)
      setLoading(false)
    }
    init()
  }, [])

  async function handleDelete(memberId) {
    if (!confirm('Remove this team member?')) return
    const res = await fetch(`/api/admin/team/${memberId}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) { alert(data.error); return }
    setTeam(prev => prev.filter(m => m.id !== memberId))
  }

  async function handleResetPassword(memberId) {
    const password = prompt('Set a new password (min 6 chars). Share it with the member — it works on both web and the terminal:')
    if (!password) return
    if (password.length < 6) { alert('Password must be at least 6 characters'); return }
    const res = await fetch(`/api/admin/team/${memberId}/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    const data = await res.json()
    if (!res.ok) { alert(data.error); return }
    alert('Password reset. It syncs to the terminal on its next launch.')
  }

  async function toggleMemberEmail(memberId, current) {
    const res = await fetch(`/api/admin/team/${memberId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_notifications_enabled: !current }),
    })
    if (!res.ok) { const d = await res.json(); alert(d.error); return }
    setTeam(prev => prev.map(m => m.id === memberId ? { ...m, email_notifications_enabled: !current } : m))
  }

  async function handleChangeRole(memberId, newSubRole) {
    if (newSubRole === 'OWNER' && !confirm('Transfer ownership to this member? You will become a Manager.')) return
    const res = await fetch(`/api/admin/team/${memberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sub_role: newSubRole }),
    })
    const data = await res.json()
    if (!res.ok) { alert(data.error); return }
    // Reload to reflect new ownership (the demoted owner loses mutate rights).
    window.location.reload()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const isOwner = subRole === 'OWNER'

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        {title && <h2 className="text-lg font-serif font-bold">{title}</h2>}
        {isOwner && (
          <Button onClick={() => setModalOpen(true)} className="ml-auto gap-2">
            <UserPlus className="h-4 w-4" /> Add Member
          </Button>
        )}
      </div>

      {error ? (
        <div className="p-3 rounded-lg bg-tibetan/10 border border-tibetan/30 text-xs text-tibetan">{error}</div>
      ) : team.length === 0 ? (
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
                        <>
                          <button
                            onClick={() => toggleMemberEmail(member.id, member.email_notifications_enabled)}
                            className={`transition-colors mr-3 ${member.email_notifications_enabled ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}
                            title={member.email_notifications_enabled ? 'Email notifications ON — click to disable' : 'Email notifications OFF — click to enable'}
                          >
                            {member.email_notifications_enabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={() => handleResetPassword(member.id)}
                            className="text-muted-foreground hover:text-primary transition-colors mr-3"
                            title="Reset password"
                          >
                            <KeyRound className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(member.id)}
                            className="text-muted-foreground hover:text-tibetan transition-colors"
                            title="Remove"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateTeamMemberModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={member => setTeam(prev => [...prev, member])}
      />
    </div>
  )
}
