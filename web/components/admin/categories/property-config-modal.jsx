'use client'

import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Edit2, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCategoryProperties } from '@/hooks/use-category-properties'
import PropertyTypeConfigs from './property-type-configs'

/**
 * Modal for configuring category properties
 */
export default function PropertyConfigModal({ category, open, onClose }) {
  const {
    properties,
    loading,
    fetchProperties,
    createProperty,
    updateProperty,
    deleteProperty,
  } = useCategoryProperties(category.id)

  const [showAddForm, setShowAddForm] = useState(false)
  const [editingProperty, setEditingProperty] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    data_type: 'text_single',
    is_required: false,
    validation_rules: {},
  })

  useEffect(() => {
    if (open) {
      fetchProperties()
    }
  }, [open, fetchProperties])

  async function handleSubmit(e) {
    e.preventDefault()

    try {
      if (editingProperty) {
        await updateProperty(editingProperty.id, formData)
      } else {
        await createProperty({
          category_id: category.id,
          ...formData,
        })
      }

      setShowAddForm(false)
      setEditingProperty(null)
      setFormData({
        name: '',
        data_type: 'text_single',
        is_required: false,
        validation_rules: {},
      })
    } catch (err) {
      alert(err.message)
    }
  }

  function handleEdit(property) {
    setEditingProperty(property)
    setFormData({
      name: property.name,
      data_type: property.data_type,
      is_required: property.is_required,
      validation_rules: property.validation_rules || {},
    })
    setShowAddForm(true)
  }

  async function handleDelete(property) {
    if (!confirm(`Delete property "${property.name}"?`)) return

    try {
      await deleteProperty(property.id)
    } catch (err) {
      alert(err.message)
    }
  }

  function handleCancel() {
    setShowAddForm(false)
    setEditingProperty(null)
    setFormData({
      name: '',
      data_type: 'text_single',
      is_required: false,
      validation_rules: {},
    })
  }

  function handleValidationRulesChange(rules) {
    setFormData({ ...formData, validation_rules: rules })
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="font-serif text-lg">
                Properties: {category.name}
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                Configure custom properties for products in this category
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6">
          {showAddForm ? (
            <div className="mb-6">
              <h3 className="font-semibold mb-4">
                {editingProperty ? 'Edit Property' : 'Add New Property'}
              </h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Property Name *</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-input rounded-md bg-background"
                      placeholder="e.g., Wattage"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Data Type *</label>
                    <select
                      required
                      value={formData.data_type}
                      onChange={(e) => setFormData({ ...formData, data_type: e.target.value })}
                      className="w-full px-3 py-2 border border-input rounded-md bg-background"
                    >
                      <option value="text_single">Text (Single Line)</option>
                      <option value="text_multi">Text (Multi Line)</option>
                      <option value="number">Number</option>
                      <option value="unit">Unit of Measurement</option>
                      <option value="datetime">Date/Time</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_required"
                    checked={formData.is_required}
                    onChange={(e) => setFormData({ ...formData, is_required: e.target.checked })}
                    className="rounded"
                  />
                  <label htmlFor="is_required" className="text-sm">Required field</label>
                </div>

                <PropertyTypeConfigs
                  dataType={formData.data_type}
                  validationRules={formData.validation_rules}
                  onChange={handleValidationRulesChange}
                />

                <div className="flex gap-2">
                  <Button type="submit">
                    {editingProperty ? 'Update' : 'Add'} Property
                  </Button>
                  <Button type="button" variant="ghost" onClick={handleCancel}>
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          ) : (
            <Button onClick={() => setShowAddForm(true)} className="mb-4">
              <Plus className="h-4 w-4 mr-2" />
              Add Property
            </Button>
          )}

          <div className="space-y-2">
            {loading ? (
              <div className="text-center py-4 text-muted-foreground">Loading...</div>
            ) : properties.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-lg">
                No properties configured for this category yet.
              </div>
            ) : (
              properties.map((property) => (
                <div
                  key={property.id}
                  className="flex items-center gap-3 p-3 border border-border rounded-lg bg-card"
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{property.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {property.data_type}
                      </span>
                      {property.is_required && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-500">
                          Required
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleEdit(property)}
                    className="p-1 hover:bg-muted rounded"
                    title="Edit"
                  >
                    <Edit2 className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => handleDelete(property)}
                    className="p-1 hover:bg-muted rounded text-red-500"
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <Button variant="outline" onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
