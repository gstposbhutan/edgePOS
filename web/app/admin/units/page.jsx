'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, Power } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUnits } from '@/hooks/use-units'

/**
 * Admin Units Management Page
 * Allows admins to manage units of measurement
 */
export default function UnitsPage() {
  const { units, loading, error, fetchUnits } = useUnits({ includeInactive: true })
  const [showForm, setShowForm] = useState(false)
  const [editingUnit, setEditingUnit] = useState(null)
  const [formData, setFormData] = useState({ name: '', abbreviation: '', category: '' })

  useEffect(() => {
    fetchUnits()
  }, [fetchUnits])

  async function handleSubmit(e) {
    e.preventDefault()

    const url = editingUnit
      ? `/api/admin/units/${editingUnit.id}`
      : '/api/admin/units'

    const method = editingUnit ? 'PATCH' : 'POST'

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${await getToken()}`,
        },
        body: JSON.stringify(formData),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save unit')
      }

      setShowForm(false)
      setEditingUnit(null)
      setFormData({ name: '', abbreviation: '', category: '' })
      fetchUnits()
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleToggleActive(unit) {
    try {
      const res = await fetch(`/api/admin/units/${unit.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${await getToken()}`,
        },
        body: JSON.stringify({ is_active: !unit.is_active }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update unit')
      }

      fetchUnits()
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleDelete(unit) {
    if (!confirm(`Delete unit "${unit.name}"?`)) return

    try {
      const res = await fetch(`/api/admin/units/${unit.id}`, {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${await getToken()}`,
        },
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete unit')
      }

      fetchUnits()
    } catch (err) {
      alert(err.message)
    }
  }

  function handleEdit(unit) {
    setEditingUnit(unit)
    setFormData({ name: unit.name, abbreviation: unit.abbreviation, category: unit.category || '' })
    setShowForm(true)
  }

  function handleCancel() {
    setShowForm(false)
    setEditingUnit(null)
    setFormData({ name: '', abbreviation: '', category: '' })
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-serif font-bold">Units of Measurement</h1>
          <p className="text-sm text-muted-foreground">Manage units available for product specifications</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Unit
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-500">
          {error}
        </div>
      )}

      {showForm && (
        <div className="mb-6 p-4 border border-border rounded-lg bg-card">
          <h2 className="text-lg font-semibold mb-4">
            {editingUnit ? 'Edit Unit' : 'Add New Unit'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background"
                  placeholder="e.g., Kilogram"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Abbreviation *</label>
                <input
                  type="text"
                  required
                  value={formData.abbreviation}
                  onChange={(e) => setFormData({ ...formData, abbreviation: e.target.value })}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background"
                  placeholder="e.g., kg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Category</label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background"
                  placeholder="e.g., weight"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit">{editingUnit ? 'Update' : 'Create'}</Button>
              <Button type="button" variant="ghost" onClick={handleCancel}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left text-sm font-medium">Sort</th>
              <th className="px-4 py-2 text-left text-sm font-medium">Name</th>
              <th className="px-4 py-2 text-left text-sm font-medium">Abbreviation</th>
              <th className="px-4 py-2 text-left text-sm font-medium">Category</th>
              <th className="px-4 py-2 text-left text-sm font-medium">Status</th>
              <th className="px-4 py-2 text-right text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" className="px-4 py-8 text-center text-muted-foreground">Loading...</td>
              </tr>
            ) : units.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-4 py-8 text-center text-muted-foreground">No units found</td>
              </tr>
            ) : (
              units.map((unit) => (
                <tr key={unit.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <button className="p-1 hover:bg-muted rounded" title="Move up">
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button className="p-1 hover:bg-muted rounded" title="Move down">
                        <ArrowDown className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-2">{unit.name}</td>
                  <td className="px-4 py-2 font-mono text-sm">{unit.abbreviation}</td>
                  <td className="px-4 py-2">{unit.category || '-'}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => handleToggleActive(unit)}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                        unit.is_active
                          ? 'bg-emerald-500/10 text-emerald-500'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <Power className="h-3 w-3" />
                      {unit.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => handleEdit(unit)}
                      className="p-1 hover:bg-muted rounded mr-1"
                      title="Edit"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleDelete(unit)}
                      className="p-1 hover:bg-muted rounded text-red-500"
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

async function getToken() {
  const { createClient } = await import('@/lib/supabase/client')
  const client = createClient()
  const { data } = await client.auth.getSession()
  return data.session?.access_token
}
