// Shared product-import spec used by BOTH the template generator (/api/products/import/template)
// and the importer (/api/products/import). One column list keeps the sheet a vendor fills and the
// parser that reads it back perfectly in sync. Built for non-technical vendors (used-goods catalogs):
// clear headers, an example row, dropdowns for condition + visibility, and an instructions sheet.

const ExcelJS = require('exceljs')

const CONDITIONS = ['New', 'Like New', 'Good', 'Fair', 'For parts']
const YES_NO = ['Yes', 'No']

// key = normalised field; header = what the vendor sees; required = must be present + valid.
const COLUMNS = [
  { key: 'name',            header: 'Product Name',        required: true,  width: 32, example: 'Refurbished Office Chair', note: 'Required. The item name shown to buyers.' },
  { key: 'category',        header: 'Category',            required: false, width: 18, example: 'Furniture',                note: 'Optional grouping, e.g. Furniture, Electronics.' },
  { key: 'condition',       header: 'Condition',           required: false, width: 14, example: 'Good',                     note: `One of: ${CONDITIONS.join(', ')}.` },
  { key: 'description',     header: 'Description',         required: false, width: 40, example: 'Ergonomic chair, minor wear on armrests.', note: 'Optional. Shown on the product page.' },
  { key: 'selling_price',   header: 'Price (Nu.)',         required: true,  width: 14, example: 1500,                       note: 'Required. The marketplace selling price in Ngultrum.' },
  { key: 'mrp',             header: 'MRP (Nu.)',           required: false, width: 12, example: 4000,                       note: 'Optional original / list price, shown struck-through.' },
  { key: 'current_stock',   header: 'Quantity',            required: true,  width: 10, example: 1,                          note: 'Required. Units available (used one-offs are usually 1).' },
  { key: 'unit',            header: 'Unit',                required: false, width: 10, example: 'pcs',                      note: 'Optional. Defaults to pcs.' },
  { key: 'sku',             header: 'SKU / Code',          required: false, width: 16, example: 'CHAIR-001',                note: 'Optional. Auto-generated if left blank.' },
  { key: 'barcode',         header: 'Barcode',             required: false, width: 16, example: '',                         note: 'Optional barcode/EAN if the item has one.' },
  { key: 'hsn_code',        header: 'HSN Code',            required: false, width: 12, example: '9401',                     note: 'Optional. HSN code for GST categorisation.' },
  { key: 'image_url',       header: 'Image URL',           required: false, width: 30, example: '',                         note: 'Optional. A public https link to a product photo.' },
  { key: 'visible_on_web',  header: 'List on Marketplace', required: false, width: 18, example: 'Yes',                      note: 'Yes = visible to buyers now. Defaults to Yes.' },
]

const HEADER_ROW = 1
const FIRST_DATA_ROW = 2
const MAX_DATA_ROWS = 500

/** Build the vendor-facing .xlsx template as an ExcelJS workbook. */
function buildTemplateWorkbook() {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Pelbu Marketplace'

  const ws = wb.addWorksheet('Products', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = COLUMNS.map(c => ({ header: c.header, key: c.key, width: c.width }))

  // Header styling.
  const header = ws.getRow(HEADER_ROW)
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
  header.alignment = { vertical: 'middle', horizontal: 'left' }
  header.height = 22
  COLUMNS.forEach((c, i) => {
    if (c.required) ws.getColumn(i + 1).header = `${c.header} *`
  })

  // One greyed example row so the vendor sees the expected shape.
  const ex = ws.addRow(COLUMNS.reduce((o, c) => { o[c.key] = c.example; return o }, {}))
  ex.font = { italic: true, color: { argb: 'FF94A3B8' } }

  // Dropdowns for condition + visibility across the data range.
  const colIndex = key => COLUMNS.findIndex(c => c.key === key) + 1
  const letter = n => ws.getColumn(n).letter
  const lastRow = FIRST_DATA_ROW + MAX_DATA_ROWS
  for (let r = FIRST_DATA_ROW; r <= lastRow; r++) {
    ws.getCell(`${letter(colIndex('condition'))}${r}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: [`"${CONDITIONS.join(',')}"`],
    }
    ws.getCell(`${letter(colIndex('visible_on_web'))}${r}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: [`"${YES_NO.join(',')}"`],
    }
  }

  // Instructions sheet.
  const info = wb.addWorksheet('Instructions')
  info.columns = [{ width: 22 }, { width: 70 }]
  info.addRow(['Pelbu Marketplace — Product Import']).font = { bold: true, size: 14 }
  info.addRow([])
  info.addRow(['How to use', 'Fill one row per product on the "Products" tab, then upload this file in your store\'s Products page → Import.']).getCell(1).font = { bold: true }
  info.addRow(['Delete the example', 'Remove the grey example row before uploading (or overwrite it).'])
  info.addRow(['Required columns', 'Columns marked with * must be filled: ' + COLUMNS.filter(c => c.required).map(c => c.header).join(', ') + '.'])
  info.addRow([])
  info.addRow(['Column', 'What to enter']).font = { bold: true }
  COLUMNS.forEach(c => info.addRow([c.header + (c.required ? ' *' : ''), c.note]))

  return wb
}

/** Coerce a cell value that may be an ExcelJS rich object / formula result into a plain string. */
function cellText(v) {
  if (v == null) return ''
  if (typeof v === 'object') {
    if (v.text != null) return String(v.text)
    if (v.result != null) return String(v.result)
    if (v.richText) return v.richText.map(t => t.text).join('')
    if (v.hyperlink) return String(v.hyperlink)
    return ''
  }
  return String(v)
}

function parseNumber(v) {
  const n = parseFloat(cellText(v).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : null
}

function parseBoolYes(v, dflt = true) {
  const s = cellText(v).trim().toLowerCase()
  if (!s) return dflt
  return ['yes', 'y', 'true', '1'].includes(s)
}

/**
 * Parse an uploaded template buffer into normalised product rows + validation errors.
 * Returns { rows, errors, total }. All-or-nothing: callers should refuse to import if errors.length.
 */
async function parseWorkbook(buffer) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const ws = wb.getWorksheet('Products') || wb.worksheets[0]
  if (!ws) return { rows: [], errors: [{ row: 0, message: 'No "Products" sheet found in the file.' }], total: 0 }

  // Map the header row → column keys (tolerant of the " *" suffix + case/space).
  const headerMap = {}
  ws.getRow(HEADER_ROW).eachCell((cell, col) => {
    const label = cellText(cell.value).replace(/\*/g, '').trim().toLowerCase()
    const spec = COLUMNS.find(c => c.header.toLowerCase() === label || c.key === label)
    if (spec) headerMap[col] = spec.key
  })
  if (!Object.values(headerMap).includes('name')) {
    return { rows: [], errors: [{ row: HEADER_ROW, message: 'Could not find the "Product Name" column header. Use the provided template.' }], total: 0 }
  }

  const rows = []
  const errors = []
  let total = 0

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === HEADER_ROW) return
    const rec = {}
    for (const [col, key] of Object.entries(headerMap)) rec[key] = row.getCell(Number(col)).value

    const name = cellText(rec.name).trim()
    // Skip the greyed example row and blank rows.
    if (!name && !cellText(rec.selling_price).trim()) return
    if (name === 'Refurbished Office Chair') return
    total++

    const rowErrors = []
    if (!name) rowErrors.push('Product Name is required')

    const price = parseNumber(rec.selling_price)
    if (price == null || price <= 0) rowErrors.push('Price must be a number greater than 0')

    const stock = parseNumber(rec.current_stock)
    if (stock == null || stock < 0 || !Number.isInteger(stock)) rowErrors.push('Quantity must be a whole number of 0 or more')

    const condition = cellText(rec.condition).trim()
    if (condition && !CONDITIONS.some(c => c.toLowerCase() === condition.toLowerCase())) {
      rowErrors.push(`Condition must be one of: ${CONDITIONS.join(', ')}`)
    }

    if (rowErrors.length) {
      errors.push({ row: rowNumber, message: rowErrors.join('; ') })
      return
    }

    const mrp = parseNumber(rec.mrp)
    rows.push({
      name,
      category: cellText(rec.category).trim() || null,
      condition: condition ? CONDITIONS.find(c => c.toLowerCase() === condition.toLowerCase()) : null,
      description: cellText(rec.description).trim() || null,
      selling_price: price,
      mrp: mrp != null && mrp > 0 ? mrp : null,
      current_stock: stock,
      unit: cellText(rec.unit).trim() || 'pcs',
      sku: cellText(rec.sku).trim() || null,
      barcode: cellText(rec.barcode).trim() || null,
      hsn_code: cellText(rec.hsn_code).trim() || null,
      image_url: cellText(rec.image_url).trim() || null,
      visible_on_web: parseBoolYes(rec.visible_on_web, true),
    })
  })

  return { rows, errors, total }
}

module.exports = { COLUMNS, CONDITIONS, buildTemplateWorkbook, parseWorkbook, MAX_DATA_ROWS }
