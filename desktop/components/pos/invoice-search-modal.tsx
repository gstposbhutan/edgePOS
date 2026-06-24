"use client";

import { useState, useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getPB } from "@/lib/pb-client";

interface OrderRow {
  id: string;
  order_no: string;
  created_at: string;
  grand_total: number;
  customer_name?: string;
  customer_phone?: string;
  buyer_whatsapp?: string;
}

const fmtMoney = (n: number) =>
  "Nu. " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso: string) =>
  iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—";

/**
 * Build a PocketBase filter for an invoice search term. Desktop order_no is
 * POS-{TERM}-{YYYYMMDD}-{NNNN} (4-digit serial). A bare number like "3" or a
 * "26/3" shorthand matches the serial suffix; anything else is free-text over
 * order_no / customer_name / customer_phone / buyer_whatsapp. PB's `~` is a
 * case-insensitive contains (same operator use-cart uses for order_no).
 */
function buildFilter(term: string): string {
  const sh = term.match(/^(\d{1,2})\s*[/\-]\s*(\d{1,4})$/); // 26/3, 3-12
  const bare = term.match(/^\d{1,4}$/);
  const serial = sh ? sh[2] : bare ? bare[0] : null;
  if (serial != null) {
    const padded = String(parseInt(serial, 10)).padStart(4, "0");
    return `order_no ~ "-${padded}"`;
  }
  const safe = term.replace(/['"\\]/g, "");
  return `(order_no ~ "${safe}" || customer_name ~ "${safe}" || customer_phone ~ "${safe}" || buyer_whatsapp ~ "${safe}")`;
}

/**
 * Invoice lookup — opened by double-clicking the Inv badge on the POS header.
 * Searches local PocketBase orders directly (offline; no API route). Selecting a
 * row opens the full order detail at /orders/detail?id=… (the existing route).
 */
export function InvoiceSearchModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<OrderRow[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);

  // Debounced search; seq guards against out-of-order responses.
  useEffect(() => {
    const term = q.trim();
    if (!term) { setResults([]); setLoading(false); return; }
    const mine = ++seq.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const pb = getPB();
        const list = await pb.collection("orders").getList<OrderRow>(1, 50, {
          filter: buildFilter(term),
          sort: "-created_at",
          requestKey: null,
        });
        if (mine === seq.current) { setResults(list.items || []); setSelected(0); }
      } catch { /* ignore */ }
      if (mine === seq.current) setLoading(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [q]);

  function open(order: OrderRow) {
    if (!order?.id) return;
    onClose();
    router.push(`/orders/detail?id=${order.id}`);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") { onClose(); return; }
    if (results.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => (s + 1) % results.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => (s - 1 + results.length) % results.length); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[selected];
      if (r) open(r);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-xl shadow-lg w-full max-w-2xl mx-4 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h3 className="text-sm font-semibold">Search Invoices</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-3 border-b border-border shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Invoice serial (e.g. 3 or 26/3) or name / phone…"
              className="pl-8 h-9"
            />
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/60 border-b border-border">
              <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="text-left px-4 py-2">Invoice</th>
                <th className="text-left px-4 py-2">Date</th>
                <th className="text-right px-4 py-2">Amount</th>
                <th className="text-left px-4 py-2">Customer</th>
                <th className="text-left px-4 py-2 w-32">Contact</th>
              </tr>
            </thead>
            <tbody>
              {!q.trim() && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-xs text-muted-foreground">
                    Type an invoice serial (e.g. 3 or 26/3) or search by name / phone.
                  </td>
                </tr>
              )}
              {q.trim() && !loading && results.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No invoices match “{q}”.
                  </td>
                </tr>
              )}
              {results.map((o, i) => (
                <tr
                  key={o.id}
                  onClick={() => setSelected(i)}
                  onDoubleClick={() => open(o)}
                  className={`border-b border-border cursor-pointer transition-colors ${
                    i === selected ? "bg-primary/10" : "hover:bg-muted/40"
                  }`}
                >
                  <td className="px-4 py-2.5 font-mono text-xs">{o.order_no}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">{fmtDate(o.created_at)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">{fmtMoney(o.grand_total)}</td>
                  <td className="px-4 py-2.5">{o.customer_name || <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-2.5 font-mono text-xs tabular-nums">
                    {o.customer_phone || o.buyer_whatsapp || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-2.5 border-t border-border flex items-center justify-between shrink-0">
          <p className="text-[11px] text-muted-foreground">↑↓ navigate · Enter / double-click to open</p>
          <Button variant="outline" size="sm" onClick={onClose}>Close (Esc)</Button>
        </div>
      </div>
    </div>
  );
}
