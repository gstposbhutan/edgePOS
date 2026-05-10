import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/**
 * GET /api/hsn
 * Search HSN codes with optional filters
 * Query params:
 * - q: search query (searches in code, description, category)
 * - chapter: filter by chapter (01-99)
 * - category: filter by category
 * - limit: max results (default 50)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') || ''
    const chapter = searchParams.get('chapter')
    const category = searchParams.get('category')
    const limit = Math.min(parseInt(searchParams.get('limit')) || 50, 200)

    let dbQuery = supabase
      .from('hsn_master')
      .select('*')
      .eq('is_active', true)
      .order('code', { ascending: true })
      .limit(limit)

    // Apply search filter
    if (query) {
      dbQuery = dbQuery.or(`code.ilike.%${query}%,description.ilike.%${query}%,short_description.ilike.%${query}%,category.ilike.%${query}%`)
    }

    // Apply chapter filter
    if (chapter) {
      dbQuery = dbQuery.eq('chapter', chapter)
    }

    // Apply category filter
    if (category) {
      dbQuery = dbQuery.eq('category', category)
    }

    const { data: hsnCodes, error } = await dbQuery

    if (error) {
      console.error('[HSN API] Error fetching HSN codes:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      hsn_codes: hsnCodes || [],
      count: hsnCodes?.length || 0
    })
  } catch (error) {
    console.error('[HSN API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/hsn
 * Get detailed HSN info by code(s)
 * Body: { codes: string[] }
 */
export async function POST(request) {
  try {
    const { codes } = await request.json()

    if (!Array.isArray(codes) || codes.length === 0) {
      return NextResponse.json({ error: 'codes array is required' }, { status: 400 })
    }

    const { data: hsnCodes, error } = await supabase
      .from('hsn_master')
      .select('*')
      .in('code', codes.slice(0, 50)) // Max 50 codes per request
      .order('code', { ascending: true })

    if (error) {
      console.error('[HSN API] Error fetching HSN details:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      hsn_codes: hsnCodes || []
    })
  } catch (error) {
    console.error('[HSN API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
