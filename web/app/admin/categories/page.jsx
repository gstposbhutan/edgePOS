'use client'

import { useState, useEffect } from 'react'
import { Plus, Settings, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useCategoryProperties } from '@/hooks/use-category-properties'
import PropertyConfigModal from '@/components/admin/categories/property-config-modal'

/**
 * Admin Categories Page
 * Allows admins to configure category-specific properties
 */
export default function CategoriesPage() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [showPropertyModal, setShowPropertyModal] = useState(false)

  useEffect(() => {
    fetchCategories()
  }, [])

  async function fetchCategories() {
    setLoading(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const client = createClient()

      const { data, error } = await client
        .from('categories')
        .select('id, name, distributor_id, distributors(name)')
        .order('name')

      if (error) throw error

      // For each category, fetch property count
      const categoriesWithCounts = await Promise.all(
        (data || []).map(async (cat) => {
          const token = (await client.auth.getSession()).data.session?.access_token
          const res = await fetch(`/api/admin/category-properties?category_id=${cat.id}`, {
            headers: { authorization: `Bearer ${token}` },
          })
          const propsData = await res.json()

          return {
            ...cat,
            propertyCount: propsData.properties?.length || 0,
          }
        })
      )

      setCategories(categoriesWithCounts)
    } catch (err) {
      console.error('[CategoriesPage] Error:', err)
    } finally {
      setLoading(false)
    }
  }

  function handleConfigureProperties(category) {
    setSelectedCategory(category)
    setShowPropertyModal(true)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-serif font-bold">Categories</h1>
        <p className="text-sm text-muted-foreground">Configure properties for each product category</p>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading categories...</div>
      ) : (
        <div className="grid gap-4">
          {categories.map((category) => (
            <div
              key={category.id}
              className="flex items-center justify-between p-4 border border-border rounded-lg bg-card hover:bg-accent/5 transition-colors"
            >
              <div>
                <h3 className="font-semibold">{category.name}</h3>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{category.propertyCount} properties configured</span>
                  {category.distributors && (
                    <span>• {category.distributors.name}</span>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleConfigureProperties(category)}
              >
                <Settings className="h-4 w-4 mr-2" />
                Configure
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {showPropertyModal && selectedCategory && (
        <PropertyConfigModal
          category={selectedCategory}
          open={showPropertyModal}
          onClose={() => {
            setShowPropertyModal(false)
            setSelectedCategory(null)
            fetchCategories() // Refresh to update property counts
          }}
        />
      )}
    </div>
  )
}
