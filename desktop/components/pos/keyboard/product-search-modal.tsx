"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Search, X } from "lucide-react";
import { useProducts, type Product } from "@/hooks/use-products";
import { priceFor, PRICE_LIST_ORDER, PRICE_LIST_LABEL, type PriceListMode } from "@/lib/price-list";

interface ProductSearchModalProps {
  open: boolean;
  /** The char that opened the modal (type-to-search); seeds the query. */
  initialQuery?: string;
  /** Active price list — the result row shows the matching tier rate. */
  priceListMode: PriceListMode;
  /** Add a product to the cart (page routes weighed goods through the weight modal). */
  onAdd: (product: Product, mode?: PriceListMode) => void;
  /** Hand a scanned barcode to the page's scan handler (reuses the grid path). */
  onScan: (barcode: string) => void;
  onClose: () => void;
}

const BARCODE_MIN_DIGITS = 8;

/**
 * Full-screen type-to-search for the keyboard (listing) layout. Mirrors the web
 * keyboard product-search modal: debounced query, results table (Product | SKU |
 * Stock | Price), ↑↓ navigate, Enter add highlighted, F1–F9 quick-add by row index,
 * Esc close. Pure-digit input (>=8 chars) is treated as a barcode and routed to the
 * page scan handler. Reads the live products list from useProducts and filters it
 * client-side (same source the grid uses).
 */
export function ProductSearchModal({
  open,
  initialQuery = "",
  priceListMode,
  onAdd,
  onScan,
  onClose,
}: ProductSearchModalProps) {
  const { allProducts } = useProducts();
  const [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);
  const [selected, setSelected] = useState(0);
  const [rateMode, setRateMode] = useState<PriceListMode>(priceListMode);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset + focus whenever the modal opens with a (possibly new) seed char.
  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setDebounced(initialQuery);
      setSelected(0);
      setRateMode(priceListMode);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open, initialQuery]);

  // Debounce the query (200ms) before it drives the filtered results.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  const results = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    if (!q) return [];
    return allProducts
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode || "").toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [allProducts, debounced]);

  useEffect(() => { setSelected(0); }, [debounced]);

  function handleAdd(product: Product) {
    onAdd(product, rateMode);
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // The page's keyboard registry listens on `document` (native) and treats F-keys /
    // Escape as global even from inputs. While this modal is open it owns those keys, so
    // stop the event before the registry sees it (else F1 toggles help, F3 re-opens
    // search, etc. underneath us). A React synthetic stopPropagation does NOT stop the
    // native document listener — must use stopImmediatePropagation on the native event.
    const owned =
      e.key === "Escape" ||
      e.key === "Enter" ||
      e.key === "ArrowDown" ||
      e.key === "ArrowUp" ||
      /^F[1-9]$/.test(e.key);
    if (owned) e.nativeEvent.stopImmediatePropagation();

    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }

    // Barcode: a pure-digit query (scanner suffixes Enter) → route to scan handler.
    if (e.key === "Enter") {
      e.preventDefault();
      const raw = query.trim();
      if (/^\d+$/.test(raw) && raw.length >= BARCODE_MIN_DIGITS) {
        onScan(raw);
        onClose();
        return;
      }
      if (results[selected]) handleAdd(results[selected]);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (results.length > 0) setSelected((s) => (s + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length > 0) setSelected((s) => (s - 1 + results.length) % results.length);
    } else if (/^F[1-9]$/.test(e.key)) {
      const idx = parseInt(e.key.slice(1), 10) - 1; // F1 → row 0 … F9 → row 8
      if (results[idx]) {
        e.preventDefault();
        handleAdd(results[idx]);
      }
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
      <div className="border-b border-border px-4 py-3 flex items-center gap-3">
        <Search className="h-5 w-5 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search product name or SKU, or scan barcode..."
          className="flex-1 text-base bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
          autoComplete="off"
        />
        {query && (
          <button onClick={() => { setQuery(""); inputRef.current?.focus(); }} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border"
        >
          Esc
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {results.length === 0 && debounced.trim() ? (
          <div className="p-8 text-center text-muted-foreground">
            <p className="text-sm">No products found for &quot;{debounced}&quot;</p>
          </div>
        ) : results.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <p className="text-sm">Start typing to search products</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                <th className="w-8 px-2 py-2" />
                <th className="text-left px-4 py-2 font-medium">Product</th>
                <th className="text-left px-4 py-2 font-medium">SKU</th>
                <th className="text-right px-4 py-2 font-medium">Stock</th>
                <th className="text-right px-4 py-2 font-medium">Price</th>
              </tr>
            </thead>
            <tbody>
              {results.map((product, i) => {
                const isOutOfStock = product.current_stock <= 0;
                const rate = priceFor(product, rateMode);
                return (
                  <tr
                    key={product.id}
                    onClick={() => handleAdd(product)}
                    onMouseEnter={() => setSelected(i)}
                    className={`border-b border-border cursor-pointer transition-colors ${
                      i === selected ? "bg-primary/10" : "hover:bg-muted/30"
                    } ${isOutOfStock ? "opacity-50" : ""}`}
                  >
                    <td className="px-2 py-3 text-center">
                      {i < 9 && (
                        <span
                          className={`inline-flex items-center justify-center w-6 h-5 rounded text-[10px] font-bold border ${
                            i === selected
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted border-border text-muted-foreground"
                          }`}
                        >
                          {`F${i + 1}`}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{product.name}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{product.sku}</td>
                    <td className="px-4 py-3 text-right font-bold text-foreground tabular-nums">
                      {product.current_stock}
                      {product.unit ? <span className="text-[10px] font-normal text-muted-foreground"> {product.unit}</span> : null}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-semibold text-primary tabular-nums">Nu. {rate.toFixed(2)}</p>
                      {product.mrp > 0 && rate < product.mrp && (
                        <p className="text-[10px] text-muted-foreground line-through tabular-nums">Nu. {product.mrp.toFixed(2)}</p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="border-t border-border px-4 py-3 flex items-center gap-4 bg-muted/20 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <span className="mr-1">Rate:</span>
          {PRICE_LIST_ORDER.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setRateMode(m)}
              className={`px-2 py-1 rounded font-medium ${rateMode === m ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}
            >
              {PRICE_LIST_LABEL[m]}
            </button>
          ))}
        </div>
        <span>↑↓ navigate</span>
        <span>F1–F9 add directly</span>
        <span>Enter add selected</span>
        <span>Esc close</span>
      </div>
    </div>
  );
}
