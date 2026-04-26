'use client'

import { useEntityProductSpecifications } from '@/hooks/use-entity-product-specifications'
import { useUnits } from '@/hooks/use-units'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'

/**
 * Component to display product specifications in a compact format
 * Suitable for product cards, admin lists, and POS display
 *
 * Props:
 * - entityProductId: The vendor product ID
 * - variant: 'compact' | 'expanded' | 'tooltip'
 * - showStandardFields: If true, show manufacturer/batch/expiry info
 */
export default function ProductSpecificationsDisplay({
  entityProductId,
  variant = 'compact',
  showStandardFields = true,
}) {
  const { specifications, loading } = useEntityProductSpecifications(entityProductId)
  const { units } = useUnits()
  const [expanded, setExpanded] = useState(false)

  if (loading) {
    return <div className="text-xs text-muted-foreground">Loading specs...</div>
  }

  if (!specifications || specifications.length === 0) {
    return null
  }

  // Get key specs for compact view (first 3)
  const keySpecs = specifications.slice(0, 3)
  const hasMore = specifications.length > 3

  if (variant === 'compact') {
    return (
      <div className="space-y-1">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {keySpecs.map((spec) => (
            <span key={spec.id} className="text-muted-foreground">
              <span className="font-medium text-foreground">{spec.property_name}:</span>{' '}
              {formatSpecValue(spec, units)}
            </span>
          ))}
          {hasMore && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-primary hover:underline"
            >
              {expanded ? `show less` : `+${specifications.length - 3} more`}
            </button>
          )}
        </div>
        {expanded && (
          <div className="mt-2 pt-2 border-t border-border">
            {specifications.map((spec) => (
              <div key={spec.id} className="flex justify-between text-xs py-1">
                <span className="font-medium">{spec.property_name}</span>
                <span className="text-muted-foreground">{formatSpecValue(spec, units)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (variant === 'expanded') {
    return (
      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Specifications</h4>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {specifications.map((spec) => (
            <div key={spec.id} className="flex justify-between py-1 border-b border-border/50">
              <span className="font-medium">{spec.property_name}</span>
              <span className="text-muted-foreground text-right">
                {formatSpecValue(spec, units)}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return null
}

/**
 * Format a specification value for display
 */
function formatSpecValue(spec, units) {
  if (!spec.value) return '-'

  switch (spec.data_type) {
    case 'unit':
      const unitObj = units.find((u) => u.id === spec.value.unit)
      return `${spec.value.value || ''}${unitObj ? ` ${unitObj.abbreviation}` : ''}`

    case 'datetime':
      if (spec.value) {
        try {
          const date = new Date(spec.value)
          const dateOnly = spec.validation_rules?.date_only
          return dateOnly
            ? date.toLocaleDateString()
            : date.toLocaleString()
        } catch {
          return spec.value
        }
      }
      return '-'

    case 'number':
      return spec.value?.toString() || '-'

    default:
      return spec.value || '-'
  }
}

/**
 * Standard fields display component
 * Shows manufacturer, batch, and expiry information
 */
export function StandardFieldsDisplay({ entityProduct, variant = 'compact' }) {
  if (!entityProduct) return null

  const fields = []

  // Manufacturer info
  if (entityProduct.manufacturer_name) {
    fields.push({ label: 'Manufacturer', value: entityProduct.manufacturer_name })
  }
  if (entityProduct.manufacturer_brand) {
    fields.push({ label: 'Brand', value: entityProduct.manufacturer_brand })
  }

  // Batch & Expiry
  if (entityProduct.batch_number) {
    fields.push({ label: 'Batch', value: entityProduct.batch_number })
  }
  if (entityProduct.expiry_date) {
    const expiry = new Date(entityProduct.expiry_date)
    const isExpiringSoon = new Date() > new Date(expiry.getTime() - 30 * 24 * 60 * 60 * 1000)
    const isExpired = new Date() > expiry
    fields.push({
      label: 'Expiry',
      value: expiry.toLocaleDateString(),
      urgent: isExpired || isExpiringSoon
    })
  }

  if (fields.length === 0) return null

  if (variant === 'compact') {
    return (
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {fields.slice(0, 3).map((field, i) => (
          <span key={i} className={field.urgent ? 'text-red-500 font-medium' : ''}>
            {field.value}
          </span>
        ))}
        {fields.length > 3 && (
          <span className="text-muted-foreground">+{fields.length - 3} more</span>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {fields.map((field, i) => (
        <div key={i} className="flex justify-between text-xs">
          <span className="font-medium">{field.label}</span>
          <span className={field.urgent ? 'text-red-500 font-medium' : 'text-muted-foreground'}>
            {field.value}
          </span>
        </div>
      ))}
    </div>
  )
}
