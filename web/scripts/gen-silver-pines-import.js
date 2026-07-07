// Converts the vendor's "Hotel Items for Sales.xlsx" into a FILLED Pelbu import template
// (matching web/lib/marketplace/product-import.js COLUMNS) for the Silver Pines catalog e2e test.
//   node scripts/gen-silver-pines-import.js  →  writes e2e/fixtures/silver-pines-import.xlsx
const path = require('path')
const ExcelJS = require('exceljs')
const { COLUMNS } = require('../lib/marketplace/product-import.js')

const SRC = process.env.SRC || path.join(__dirname, '..', '..', 'Hotel Items for Sales.xlsx')
const OUT = path.join(__dirname, '..', 'e2e', 'fixtures', 'silver-pines-import.xlsx')

const num = v => (v && typeof v === 'object') ? (v.result ?? null) : (typeof v === 'number' ? v : parseFloat(v) || null)
const txt = v => v == null ? '' : (typeof v === 'object' ? (v.result ?? v.text ?? '') : String(v)).toString().trim()

function categorize(name) {
  const n = name.toLowerCase()
  if (/(bed|mattress|pillow|quilt|cushion|runner|head rest)/.test(n)) return 'Bedding'
  if (/(bath|toilet|towel|slipper|sliper|shower|shampoo|jel|foot mat|mug|bucket)/.test(n)) return 'Bathroom'
  if (/(tv|fridge|intercom|boiler|setup box|remote)/.test(n)) return 'Electronics'
  if (/(curtain)/.test(n)) return 'Furnishing'
  if (/(glass|cup|tray|table mat)/.test(n)) return 'Tableware'
  return 'Furniture'
}

;(async () => {
  const src = new ExcelJS.Workbook()
  await src.xlsx.readFile(SRC)
  const ws = src.getWorksheet('Item List for Sales')

  const products = []
  ws.eachRow((row, i) => {
    if (i <= 2) return
    const name = txt(row.getCell(2).value)
    const mrp = num(row.getCell(3).value)
    const price = num(row.getCell(5).value)
    const note = txt(row.getCell(6).value)
    if (!name || !price) return
    products.push({
      name,
      category: categorize(name),
      condition: 'Good',
      description: note || null,
      selling_price: price,
      mrp: mrp || null,
      current_stock: 1,      // used one-offs — the source has no quantity column
      unit: 'pcs',
      visible_on_web: 'Yes',
    })
  })

  // Build a filled workbook whose headers match the importer's COLUMNS exactly.
  const out = new ExcelJS.Workbook()
  const sheet = out.addWorksheet('Products')
  sheet.columns = COLUMNS.map(c => ({ header: c.header + (c.required ? ' *' : ''), key: c.key, width: c.width }))
  for (const p of products) sheet.addRow(p)

  await out.xlsx.writeFile(OUT)
  console.log(`Wrote ${products.length} products → ${OUT}`)
})()
