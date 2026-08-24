"use client"

/**
 * The stock register (spec WF-09) — levels, read the way a stock statement is read.
 *
 * The question this table answers is "what is short", and that is a column read: the eye runs
 * down Stock looking for the small numbers. So the figures are tabular and right-aligned, the
 * rows band, and status is a WORD in a fixed column rather than a pill of varying width — a
 * pill moves the column edge on every row and defeats the scan.
 *
 * Dressed from the office tokens (app/globals.css) so it matches the registers the rest of the
 * back office uses. Rendered inside a page that carries `.office-ui`.
 *
 * @param {{ products: object[], onAdjust: (product: object) => void }} props
 */
export function StockTable({ products, onAdjust }) {
  if (products.length === 0) {
    return (
      <div
        className="py-12 text-center text-[12px] opacity-60 border"
        style={{ background: 'var(--office-panel-bg)', borderColor: 'var(--office-line)' }}
      >
        No products match this filter.
      </div>
    )
  }

  return (
    <div
      className="overflow-x-auto border"
      style={{ background: 'var(--office-panel-bg)', borderColor: 'var(--office-line)' }}
      data-testid="office-grid"
    >
      <table className="w-auto border-collapse text-[11px]">
        <thead>
          <tr>
            {[
              ['Product', 260, 'left'],
              ['HSN', 80, 'left'],
              ['SKU', 110, 'left'],
              ['Stock', 80, 'right'],
              ['Unit', 60, 'left'],
              ['Status', 100, 'left'],
              ['Price (MRP)', 100, 'right'],
              ['', 80, 'left'],
            ].map(([label, width, align]) => (
              <th
                key={label || 'act'}
                scope="col"
                className="px-2 py-1 font-bold whitespace-nowrap border"
                style={{
                  width, textAlign: align,
                  background: 'var(--office-grid-head-bg)',
                  color: 'var(--office-grid-head-fg)',
                  borderColor: 'var(--office-line)',
                }}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {products.map((product, i) => (
            <StockRow key={product.id} product={product} index={i} onAdjust={() => onAdjust(product)} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StockRow({ product, index, onAdjust }) {
  const stock = product.current_stock ?? 0
  const isOut = stock <= 0
  const isLow = stock > 0 && stock <= 10
  const price = parseFloat(product.mrp ?? product.wholesale_price ?? 0)
  const status = isOut ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock'

  const cell = { borderColor: 'var(--office-line)' }

  return (
    <tr style={{ background: index % 2 ? 'var(--office-row-b)' : 'var(--office-row-a)' }}>
      <td className="px-2 py-1 border font-medium" style={cell}>{product.name}</td>
      <td className="px-2 py-1 border opacity-75" style={cell}>{product.hsn_code ?? '—'}</td>
      <td className="px-2 py-1 border opacity-75" style={cell}>{product.sku ?? '—'}</td>
      <td
        data-testid="stock-qty"
        className="px-2 py-1 border text-right font-bold tabular-nums"
        style={{ ...cell, color: isOut ? '#B91C1C' : isLow ? '#B45309' : undefined }}
      >
        {stock}
      </td>
      <td className="px-2 py-1 border opacity-75" style={cell}>{product.unit ?? 'pcs'}</td>
      <td
        data-testid="stock-status"
        className="px-2 py-1 border"
        style={{ ...cell, color: isOut ? '#B91C1C' : isLow ? '#B45309' : '#15803D' }}
      >
        {status}
      </td>
      <td className="px-2 py-1 border text-right tabular-nums" style={cell}>{price.toFixed(2)}</td>
      <td className="px-2 py-1 border" style={cell}>
        <button type="button" onClick={onAdjust} className="underline">Adjust</button>
      </td>
    </tr>
  )
}
