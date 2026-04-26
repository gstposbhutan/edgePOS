'use client'

import { useState, useEffect } from 'react'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { UserPlus, Trash2, Shield } from 'lucide-react'
import { CreateTeamMemberModal } from '@/components/admin/create-team-member-modal'

const SUB_ROLE_STYLES = {
  OWNER: 'bg-primary/10 text-primary border-primary/20',
  MANAGER: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  STAFF: 'bg-muted text-muted-foreground border-border',
}

export default function TeamPage() {
  const { user, loading: authLoading } = useAdminAuth()
  const [team, setTeam] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  async function loadTeam() {
    if (!user) return

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const res = await fetch('/api/admin/team', {
      headers: { authorization: `Bearer ${session.access_token}` },
    })
    const data = await res.json()

    if (data.team) setTeam(data.team)
    setLoading(false)
  }

  useEffect(() => {
    loadTeam()
  }, [user])

  async function handleDelete(memberId) {
    if (!confirm('Remove this team member?')) return

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    await fetch(`/api/admin/team/${memberId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${session.access_token}` },
    })

    setTeam(prev => prev.filter(m => m.id !== memberId))
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-serif font-bold text-foreground">Team Members</h1>
        <Button onClick={() => setModalOpen(true)} className="bg-primary hover:bg-primary/90">
          <UserPlus className="mr-2 h-4 w-4" />
          Add Member
        </Button>
      </div>

      <Card className="glassmorphism">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {team.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No team members yet
                  </TableCell>
                </TableRow>
              ) : (
                team.map(member => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{member.full_name}</TableCell>
                    <TableCell className="text-muted-foreground">{member.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={SUB_ROLE_STYLES[member.sub_role] || ''}>
                        {member.sub_role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {member.sub_role !== 'OWNER' && (
                        <button
                          onClick={() => handleDelete(member.id)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-tibetan hover:bg-tibetan/10 transition-colors"
                          title="Remove member"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CreateTeamMemberModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(member) => {
          setTeam(prev => [...prev, member])
        }}
      />
    </div>
  )
}
