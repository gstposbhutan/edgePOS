'use client'

import { useState, useEffect } from 'react'
import { useCategoryProperties } from '@/hooks/use-category-properties'
import { useUnits } from '@/hooks/use-units'

/**
 * Component that renders dynamic specification fields based on product category or HSN code
 *
 * Props:
 * - categoryId: The category ID to fetch properties for (legacy, for backward compatibility)
 * - hsnCode: The HSN code for HSN-based property lookup (preferred method)
 * - entityProductId: The vendor product ID to fetch existing values for (optional, for editing)
 * - values: Current specification values (for controlled component behavior)
 * - onChange: Callback when values change
 * - readonly: If true, display values without edit capability
 */
export default function EntityProductSpecifications({
  categoryId = null,
  hsnCode = null,
  entityProductId = null,
  values = {},
  onChange = null,
  readonly = false,
}) {
  const { properties, loading: propsLoading } = useCategoryProperties(categoryId, hsnCode)
  const { units } = useUnits()
  const [localValues, setLocalValues] = useState({})

  // Initialize local values from props
  useEffect(() => {
    if (Object.keys(values).length > 0) {
      setLocalValues(values)
    }
  }, [values])

  function handleChange(propertyId, newValue) {
    const updated = { ...localValues, [propertyId]: newValue }
    setLocalValues(updated)
    if (onChange) {
      onChange(updated)
    }
  }

  function getStoredValue(propertyId) {
    return localValues[propertyId] || null
  }

  if (propsLoading) {
    return <div className="text-sm text-muted-foreground">Loading specifications...</div>
  }

  if (properties.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 border border-dashed border-border rounded-lg text-center">
        {hsnCode
          ? `No custom specifications defined for HSN code ${hsnCode}.`
          : 'No custom specifications defined for this category.'}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-sm">Product Specifications</h3>
      {properties.map((property) => {
        const value = getStoredValue(property.id)
        const required = property.is_required

        return (
          <div key={property.id} className="space-y-1">
            <label className="block text-sm font-medium">
              {property.name}
              {required && <span className="text-red-500 ml-1">*</span>}
            </label>
            {readonly ? (
              <ReadOnlyValue property={property} value={value} units={units} />
            ) : (
              <InputField
                property={property}
                value={value}
                units={units}
                onChange={(newValue) => handleChange(property.id, newValue)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Read-only display of a specification value
 */
function ReadOnlyValue({ property, value, units }) {
  if (!value) {
    return <div className="text-sm text-muted-foreground italic">Not specified</div>
  }

  let displayValue = value

  switch (property.data_type) {
    case 'unit':
      const unitObj = units.find((u) => u.id === value.unit)
      displayValue = `${value.value || ''}${unitObj ? ` ${unitObj.abbreviation}` : ''}`
      break
    case 'datetime':
      if (value) {
        try {
          const date = new Date(value)
          displayValue = date.toLocaleDateString()
          if (!property.validation_rules?.date_only) {
            displayValue += ` ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          }
        } catch {
          displayValue = value
        }
      }
      break
    case 'number':
      displayValue = value?.toString() || ''
      break
    default:
      displayValue = value || ''
  }

  return <div className="text-sm">{displayValue}</div>
}

/**
 * Input field for editing a specification value
 */
function InputField({ property, value, units, onChange }) {
  const validation = property.validation_rules || {}

  switch (property.data_type) {
    case 'text_single':
      return (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value || null)}
          maxLength={validation.maxLength || undefined}
          pattern={validation.pattern || undefined}
          className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
          placeholder={`Enter ${property.name.toLowerCase()}`}
        />
      )

    case 'text_multi':
      return (
        <textarea
          value={value || ''}
          onChange={(e) => onChange(e.target.value || null)}
          maxLength={validation.maxLength || undefined}
          rows={3}
          className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm resize-none"
          placeholder={`Enter ${property.name.toLowerCase()}`}
        />
      )

    case 'number':
      return (
        <input
          type="number"
          value={value || ''}
          onChange={(e) => onChange(e.target.value ? parseFloat(e.target.value) : null)}
          min={validation.min || undefined}
          max={validation.max || undefined}
          step="any"
          className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
          placeholder={`Enter ${property.name.toLowerCase()}`}
        />
      )

    case 'unit':
      const allowedUnits = units.filter((u) =>
        (validation.allowed_units || []).includes(u.id)
      )

      return (
        <div className="flex gap-2">
          <input
            type="text"
            value={value?.value || ''}
            onChange={(e) => onChange({ ...value, value: e.target.value || null })}
            className="flex-1 px-3 py-2 border border-input rounded-md bg-background text-sm"
            placeholder="Value"
          />
          <select
            value={value?.unit || ''}
            onChange={(e) => onChange({ ...value, unit: e.target.value || null })}
            className="px-3 py-2 border border-input rounded-md bg-background text-sm min-w-[100px]"
          >
            <option value="">Select unit</option>
            {allowedUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.abbreviation}
              </option>
            ))}
          </select>
        </div>
      )

    case 'datetime':
      const inputType = validation.date_only ? 'date' : 'datetime-local'
      return (
        <input
          type={inputType}
          value={value || ''}
          onChange={(e) => onChange(e.target.value || null)}
          className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
        />
      )

    default:
      return null
  }
}
