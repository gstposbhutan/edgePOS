import { useState, useCallback } from 'react'

/**
 * Hook for searching and managing HSN codes
 * Provides search functionality and category inheritance
 */
export function useHsnCodes(options = {}) {
  const { chapter, category } = options
  const [hsnCodes, setHsnCodes] = useState([])
  const [selectedCode, setSelectedCode] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  /**
   * Search HSN codes by query
   */
  const searchCodes = useCallback(async (query) => {
    if (!query || query.length < 2) {
      setHsnCodes([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      params.set('q', query)
      if (chapter) params.set('chapter', chapter)
      if (category) params.set('category', category)
      params.set('limit', '50')

      const res = await fetch(`/api/hsn?${params}`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to search HSN codes')
      }

      setHsnCodes(data.hsn_codes || [])
    } catch (err) {
      console.error('[useHsnCodes] Search error:', err)
      setError(err.message)
      setHsnCodes([])
    } finally {
      setLoading(false)
    }
  }, [chapter, category])

  /**
   * Get detailed HSN info by code
   */
  const getCodeDetails = useCallback(async (code) => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/hsn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes: [code] })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to get HSN details')
      }

      const hsnInfo = data.hsn_codes?.[0]
      if (hsnInfo) {
        setSelectedCode(hsnInfo)
        return hsnInfo
      }

      return null
    } catch (err) {
      console.error('[useHsnCodes] Get details error:', err)
      setError(err.message)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Get category path from HSN code
   * Returns: { chapter, heading, subheading, category, subcategory }
   */
  const getCategoryPath = useCallback((hsnCode) => {
    if (!hsnCode) return null

    const code = hsnCodes.find(c => c.code === hsnCode)
    if (!code && selectedCode?.code === hsnCode) {
      return selectedCode
    }

    return code || null
  }, [hsnCodes, selectedCode])

  /**
   * Format HSN code for display
   */
  const formatCode = useCallback((code) => {
    if (!code) return '-'
    // Add dots for readability if not present: 300410 -> 3004.10.00
    if (!code.includes('.')) {
      if (code.length === 8) {
        return `${code.slice(0, 4)}.${code.slice(4, 6)}.${code.slice(6)}`
      }
    }
    return code
  }, [])

  /**
   * Get tax rates summary for display
   */
  const getTaxSummary = useCallback((hsnCode) => {
    const codeData = getCategoryPath(hsnCode)
    if (!codeData) return null

    const { customs_duty, sales_tax, green_tax } = codeData

    // Build tax summary string
    const parts = []
    if (customs_duty > 0) parts.push(`CD: ${customs_duty}%`)
    if (sales_tax > 0) parts.push(`ST: ${sales_tax}%`)
    if (green_tax > 0) parts.push(`GT: ${green_tax}%`)

    return {
      raw: { customs_duty, sales_tax, green_tax },
      display: parts.length > 0 ? parts.join(' + ') : 'Tax Free',
      total: customs_duty + sales_tax + green_tax
    }
  }, [getCategoryPath])

  return {
    hsnCodes,
    selectedCode,
    loading,
    error,
    searchCodes,
    getCodeDetails,
    getCategoryPath,
    formatCode,
    getTaxSummary,
    setSelectedCode
  }
}

/**
 * Hook for HSN categories (chapters)
 * Lists available chapters with descriptions
 */
export function useHsnChapters() {
  const [chapters, setChapters] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchChapters = useCallback(async () => {
    setLoading(true)
    try {
      // Get unique chapters from HSN master
      const res = await fetch('/api/hsn?limit=1000')
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch chapters')
      }

      // Group by chapter
      const chapterMap = new Map()
      data.hsn_codes?.forEach(hsn => {
        if (!chapterMap.has(hsn.chapter)) {
          chapterMap.set(hsn.chapter, {
            chapter: hsn.chapter,
            count: 0,
            categories: []
          })
        }
        const chapterData = chapterMap.get(hsn.chapter)
        chapterData.count++
        if (hsn.category && !chapterData.categories.includes(hsn.category)) {
          chapterData.categories.push(hsn.category)
        }
      })

      // Convert to array and sort
      const chaptersArray = Array.from(chapterMap.values())
        .sort((a, b) => a.chapter.localeCompare(b.chapter))

      setChapters(chaptersArray)
    } catch (error) {
      console.error('[useHsnChapters] Error:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  return { chapters, loading, fetchChapters }
}
