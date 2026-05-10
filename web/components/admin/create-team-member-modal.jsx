'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const ROLE_PERMISSIONS = {
  MANAGER: ['inventory:read', 'inventory:write', 'orders:read', 'orders:write', 'reports:read', 'khata:read'],
  CASHIER: ['orders:read', 'orders:write'],
  STAFF:   ['orders:read', 'orders:write'],
}

export function CreateTeamMemberModal({ open, onClose, onCreated }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [subRole, setSubRole] = useState('STAFF')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/admin/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          email,
          password,
          sub_role: subRole,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to create team member')
        setLoading(false)
        return
      }

      onCreated(data.member)
      setFullName('')
      setEmail('')
      setPassword('')
      setSubRole('STAFF')
      onClose()
    } catch {
      setError('Something went wrong')
    }

    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="glassmorphism">
        <DialogHeader>
          <DialogTitle className="font-serif">Add Team Member</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Full Name</label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Pema Dorji"
              required
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="member@business.bt"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
              required
              minLength={6}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Role</label>
            <Select value={subRole} onValueChange={setSubRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MANAGER">Manager</SelectItem>
                <SelectItem value="CASHIER">Cashier</SelectItem>
                <SelectItem value="STAFF">Staff</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {subRole === 'MANAGER'
                ? 'Can manage inventory, orders, and view reports'
                : 'Can process orders only'}
            </p>
          </div>

          {error && (
            <div className="p-3 bg-tibetan/10 border border-tibetan/30 rounded-lg">
              <p className="text-xs text-tibetan">{error}</p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-primary hover:bg-primary/90">
              {loading
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</>
                : 'Add Member'
              }
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
