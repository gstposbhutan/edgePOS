'use client'

import { useState, useEffect } from 'react'
import { useUnits } from '@/hooks/use-units'

/**
 * Component that renders validation rule inputs based on property data type
 */
export default function PropertyTypeConfigs({ dataType, validationRules, onChange }) {
  const { units } = useUnits()

  function handleChange(key, value) {
    onChange({ ...validationRules, [key]: value })
  }

  switch (dataType) {
    case 'number':
      return (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Minimum Value</label>
            <input
              type="number"
              value={validationRules.min || ''}
              onChange={(e) => handleChange('min', parseFloat(e.target.value) || null)}
              className="w-full px-3 py-2 border border-input rounded-md bg-background"
              placeholder="No minimum"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Maximum Value</label>
            <input
              type="number"
              value={validationRules.max || ''}
              onChange={(e) => handleChange('max', parseFloat(e.target.value) || null)}
              className="w-full px-3 py-2 border border-input rounded-md bg-background"
              placeholder="No maximum"
            />
          </div>
        </div>
      )

    case 'text_single':
    case 'text_multi':
      return (
        <div>
          <label className="block text-sm font-medium mb-1">Maximum Length</label>
          <input
            type="number"
            value={validationRules.maxLength || ''}
            onChange={(e) => handleChange('maxLength', parseInt(e.target.value) || null)}
            className="w-full px-3 py-2 border border-input rounded-md bg-background"
            placeholder="No limit"
          />
          {dataType === 'text_single' && (
            <div className="mt-4">
              <label className="block text-sm font-medium mb-1">Validation Pattern (Regex)</label>
              <input
                type="text"
                value={validationRules.pattern || ''}
                onChange={(e) => handleChange('pattern', e.target.value || null)}
                className="w-full px-3 py-2 border border-input rounded-md bg-background font-mono text-sm"
                placeholder="e.g., ^[A-Z0-9]+$"
              />
              <p className="text-xs text-muted-foreground mt-1">Regular expression for validation</p>
            </div>
          )}
        </div>
      )

    case 'unit':
      return (
        <div>
          <label className="block text-sm font-medium mb-1">Allowed Units</label>
          <p className="text-xs text-muted-foreground mb-2">Select which units can be used for this property</p>
          <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto border border-input rounded-md p-2">
            {units.map((unit) => (
              <label key={unit.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-accent/50 p-1 rounded">
                <input
                  type="checkbox"
                  checked={(validationRules.allowed_units || []).includes(unit.id)}
                  onChange={(e) => {
                    const current = validationRules.allowed_units || []
                    if (e.target.checked) {
                      handleChange('allowed_units', [...current, unit.id])
                    } else {
                      handleChange('allowed_units', current.filter((id) => id !== unit.id))
                    }
                  }}
                  className="rounded"
                />
                <span>{unit.abbreviation}</span>
              </label>
            ))}
          </div>
        </div>
      )

    case 'datetime':
      return (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="dateOnly"
            checked={validationRules.date_only || false}
            onChange={(e) => handleChange('date_only', e.target.checked)}
            className="rounded"
          />
          <label htmlFor="dateOnly" className="text-sm">Date only (exclude time)</label>
        </div>
      )

    default:
      return null
  }
}
