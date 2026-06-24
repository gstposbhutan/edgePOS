"use client";

import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import {
  findOrderForExchange,
  submitExchange,
  type ExchangeOrder,
} from "@/hooks/use-exchange";

/** Exchange / return flow: search a past order → pick return quantities → submit. */
export function ExchangeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [orders, setOrders] = useState<ExchangeOrder[]>([]);
  const [order, setOrder] = useState<ExchangeOrder | null>(null);
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) {
      setQ("");
      setOrders([]);
      setOrder(null);
      setReturnQty({});
    }
  }, [open]);

  useEffect(() => {
    if (order) return; // search only before an order is selected
    const term = q.trim();
    if (!term) { setOrders([]); return; }
    const mine = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await findOrderForExchange(term);
        if (mine === seq.current) setOrders(r);
      } catch { /* ignore */ }
      if (mine === seq.current) setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [q, order]);

  const returns =
    order?.items?.filter((it) => (returnQty[it.id] || 0) > 0).map((item) => ({ item, qty: returnQty[item.id] })) ?? [];

  const submit = async () => {
    if (!order) return;
    setSubmitting(true);
    const r = await submitExchange(order, returns);
    setSubmitting(false);
    if (r.success) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{order ? `Exchange — ${order.order_no}` : "Exchange / Return"}</DialogTitle>
        </DialogHeader>

        {!order ? (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Invoice no, name, or phone…"
                className="pl-8"
                autoFocus
              />
            </div>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
              {orders.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setOrder(o)}
                  className="w-full text-left px-3 py-2.5 border-b border-border last:border-0 hover:bg-accent/50"
                >
                  <div className="flex justify-between">
                    <span className="font-mono text-xs">{o.order_no}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      Nu. {(o.grand_total || 0).toFixed(2)}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">{o.customer_name || "Walk-in"}</span>
                </button>
              ))}
              {q.trim() && !loading && orders.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matching invoices.</p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              {(order.items || []).map((it) => (
                <div key={it.id} className="flex items-center gap-2 rounded-md border border-border p-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{it.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Bought {it.quantity} · Nu. {it.unit_price.toFixed(2)}/unit
                    </p>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={it.quantity}
                    value={returnQty[it.id] || ""}
                    placeholder="0"
                    onChange={(e) =>
                      setReturnQty((p) => ({
                        ...p,
                        [it.id]: Math.min(it.quantity, Math.max(0, parseInt(e.target.value, 10) || 0)),
                      }))
                    }
                    className="w-16 rounded border border-border bg-background p-1 text-sm text-center"
                  />
                </div>
              ))}
              {(!order.items || order.items.length === 0) && (
                <p className="text-sm text-muted-foreground">This invoice has no items.</p>
              )}
            </div>
            <div className="flex gap-2 pt-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setOrder(null); setReturnQty({}); }}
                disabled={submitting}
              >
                Back
              </Button>
              <Button className="flex-1" onClick={submit} disabled={submitting || returns.length === 0}>
                {submitting ? "Processing…" : `Return ${returns.reduce((s, r) => s + r.qty, 0)} unit(s)`}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
