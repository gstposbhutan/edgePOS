import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = ctx.supabase

  const { data, error } = await supabase
    .from('categories')
    .select('id, name, distributor_id, distributors(name)')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const categoriesWithCounts = await Promise.all(
    (data || []).map(async (cat) => {
      const { data: props } = await supabase
        .from('category_properties')
        .select('id')
        .eq('category_id', cat.id)

      return { ...cat, propertyCount: props?.length || 0 }
    })
  )

  return NextResponse.json({ categories: categoriesWithCounts })
}
