import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'
import { buildTemplateWorkbook } from '@/lib/marketplace/product-import'

// GET /api/products/import/template — download the vendor-facing .xlsx product import template.
export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const wb = buildTemplateWorkbook()
  const buf = await wb.xlsx.writeBuffer()

  return new NextResponse(Buffer.from(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="pelbu-product-import-template.xlsx"',
      'Cache-Control': 'no-store',
    },
  })
}
