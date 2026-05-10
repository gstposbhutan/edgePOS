'use client'

import { useState, useEffect } from 'react'
import { Search, ChevronDown, Check, Info } from 'lucide-react'
import { useHsnCodes } from '@/hooks/use-hsn-codes'

/**
 * HSN Code Selector with Category Inheritance Display
 *
 * This component demonstrates how product categories and subcategories
 * are automatically inherited from the selected HSN code.
 *
 * Props:
 * - value: Selected HSN code
 * - onChange: Callback when HSN code is selected
 * - disabled: Disable the selector
 * - showTaxInfo: Show tax rate information
 */
export default function HsnCodeSelector({
  value = '',
  onChange = null,
  disabled = false,
  showTaxInfo = true
}) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [debouncedQuery, setDebouncedQuery] = useState('')

  const {
    hsnCodes,
    selectedCode,
    loading,
    searchCodes,
    getCodeDetails,
    getCategoryPath,
    formatCode,
    getTaxSummary
  } = useHsnCodes()

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  // Search when debounced query changes
  useEffect(() => {
    if (debouncedQuery && debouncedQuery.length >= 2) {
      searchCodes(debouncedQuery)
    }
  }, [debouncedQuery, searchCodes])

  // Load details for initial value
  useEffect(() => {
    if (value && !selectedCode) {
      getCodeDetails(value)
    }
  }, [value, selectedCode, getCodeDetails])

  // Get category path for selected code
  const categoryPath = value ? getCategoryPath(value) : null

  // Handle code selection
  async function handleSelectCode(code) {
    if (onChange) {
      onChange(code)
    }
    const details = await getCodeDetails(code)
    if (details) {
      setIsOpen(false)
      setQuery('')
    }
  }

  // Tax summary for selected code
  const taxSummary = value ? getTaxSummary(value) : null

  return (
    <div className="space-y-3">
      {/* HSN Code Input with Dropdown */}
      <div className="relative">
        <label className="block text-sm font-medium mb-1">
          HSN Code <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <div className="flex gap-2">
            {/* Search input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={isOpen ? query : value || ''}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setIsOpen(true)
                }}
                onFocus={() => setIsOpen(true)}
                onBlur={() => setTimeout(() => setIsOpen(false), 200)}
                disabled={disabled}
                placeholder="Search HSN code..."
                className="w-full pl-10 pr-4 py-2 border border-input rounded-md bg-background text-sm"
              />
              {isOpen && (
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </div>

          {/* Dropdown */}
          {isOpen && (query || hsnCodes.length > 0) && (
            <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
              {loading ? (
                <div className="p-3 text-sm text-muted-foreground text-center">
                  Loading...
                </div>
              ) : hsnCodes.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground text-center">
                  No HSN codes found
                </div>
              ) : (
                <div className="py-1">
                  {hsnCodes.map((code) => (
                    <button
                      key={code.id}
                      type="button"
                      onClick={() => handleSelectCode(code.code)}
                      className="w-full text-left px-3 py-2 hover:bg-muted transition-colors border-b border-border/50 last:border-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{code.code}</span>
                            <span className="text-xs text-muted-foreground">{code.short_description}</span>
                          </div>
                          {code.description && (
                            <div className="text-xs text-muted-foreground truncate mt-0.5">
                              {code.description}
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded">
                              {code.category}
                            </span>
                            {showTaxInfo && (
                              <span className="text-xs text-muted-foreground">
                                CD: {code.customs_duty}% | ST: {code.sales_tax}%
                              </span>
                            )}
                          </div>
                        </div>
                        {value === code.code && (
                          <Check className="h-4 w-4 text-primary flex-shrink-0" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Inherited Category Information */}
      {categoryPath && (
        <div className="p-4 bg-muted/30 border border-border rounded-lg space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Info className="h-4 w-4 text-primary" />
            <span>Inherited Category Information</span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            {/* Category (inherited from HSN) */}
            <div>
              <span className="text-muted-foreground">Category:</span>
              <span className="ml-2 font-medium">{categoryPath.category || '-'}</span>
            </div>

            {/* Subcategory (inherited from HSN short_description) */}
            <div>
              <span className="text-muted-foreground">Subcategory:</span>
              <span className="ml-2 font-medium">{categoryPath.short_description || '-'}</span>
            </div>

            {/* Chapter */}
            <div>
              <span className="text-muted-foreground">Chapter:</span>
              <span className="ml-2 font-medium">Ch. {categoryPath.chapter}</span>
            </div>

            {/* Heading */}
            <div>
              <span className="text-muted-foreground">Heading:</span>
              <span className="ml-2 font-medium">{categoryPath.heading}</span>
            </div>
          </div>

          {/* HSN Hierarchy */}
          <div className="text-xs text-muted-foreground border-t border-border/50 pt-2">
            HSN Hierarchy: {categoryPath.chapter} → {categoryPath.heading} → {categoryPath.subheading || '-'}
          </div>

          {/* Tax Information */}
          {showTaxInfo && taxSummary && (
            <div className="flex items-center justify-between border-t border-border/50 pt-2">
              <span className="text-xs text-muted-foreground">Tax Rates:</span>
              <span className={`text-sm font-medium ${
                taxSummary.total === 0 ? 'text-green-600' : 'text-orange-600'
              }`}>
                {taxSummary.display}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Category Inheritance Notice */}
      <p className="text-xs text-muted-foreground">
        <Info className="h-3 w-3 inline mr-1" />
        Category and subcategory are automatically inherited from the selected HSN code.
      </p>
    </div>
  )
}
