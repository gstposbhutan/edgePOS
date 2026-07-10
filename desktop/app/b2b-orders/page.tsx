"use client";

import { useState } from "react";
import Link from "next/link";
import { useB2bOrders, type B2bOrder } from "@/hooks/use-b2b-orders";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw, Boxes, Store, Phone, Loader2, XCircle } from "lucide-react";

// Seller-side fulfilment chain (mirrors the web console + /api/sync/wholesale-orders state machine).
const NEXT_ACTIONS: Record<string, { to: string; label: string; danger?: boolean }[]> = {
  CONFIRMED:  [{ to: "PROCESSING", label: "Start processing" }, { to: "DISPATCHED", label: "Mark dispatched" }, { to: "CANCELLED", label: "Cancel", danger: true }],
  PROCESSING: [{ to: "DISPATCHED", label: "Mark dispatched" }, { to: "CANCELLED", label: "Cancel", danger: true }],
  DISPATCHED: [{ to: "DELIVERED", label: "Mark delivered" }],
  DELIVERED:  [{ to: "COMPLETED", label: "Mark completed" }],
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    CONFIRMED: "text-blue-600 border-blue-500/30 bg-blue-500/10",
    PROCESSING: "text-amber-600 border-amber-500/30 bg-amber-500/10",
    DISPATCHED: "text-emerald-600 border-emerald-500/30 bg-emerald-500/10",
    DELIVERED: "text-emerald-600 border-emerald-500/30 bg-emerald-500/10",
  };
  return <Badge variant="outline" className={map[status] || "text-muted-foreground"}>{status}</Badge>;
}

export default function B2bOrdersPage() {
  const { orders, loading, refresh, act } = useB2bOrders();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelFor, setCancelFor] = useState<B2bOrder | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  async function advance(o: B2bOrder, to: string) {
    if (to === "CANCELLED") { setCancelFor(o); return; }
    setBusyId(o.cloud_id);
    const res = await act(o.cloud_id, to);
    setBusyId(null);
    if (res.ok) toast.success(`Order ${o.order_no} → ${to.toLowerCase()}`);
    else toast.error(res.error || "Could not update");
  }

  async function doCancel() {
    if (!cancelFor) return;
    const o = cancelFor;
    setBusyId(o.cloud_id);
    const res = await act(o.cloud_id, "CANCELLED", cancelReason.trim() || undefined);
    setBusyId(null);
    setCancelFor(null);
    setCancelReason("");
    if (res.ok) toast.success(`Order ${o.order_no} cancelled`);
    else toast.error(res.error || "Could not cancel");
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div className="flex items-center gap-2">
            <Boxes className="h-5 w-5" />
            <h1 className="font-semibold">B2B Orders</h1>
            <Badge variant="outline">{orders.length}</Badge>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={refresh} disabled={loading} title="Refresh">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5">
        {orders.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Boxes className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No incoming B2B orders right now.</p>
            <p className="text-xs opacity-60 mt-1">Orders your buyers place appear here automatically.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((o) => {
              const actions = NEXT_ACTIONS[o.status] || [];
              return (
                <div key={o.id} className="border border-border rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground font-mono">{o.order_no}</p>
                      <p className="text-sm font-semibold text-primary">Nu. {Number(o.grand_total).toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{o.payment_method}</Badge>
                      <StatusBadge status={o.status} />
                    </div>
                  </div>

                  <div className="p-4 space-y-3">
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-1.5 font-medium"><Store className="h-3.5 w-3.5 text-muted-foreground" /> {o.buyer_name || "Buyer"}</div>
                      {o.buyer_phone && <a href={`tel:${o.buyer_phone}`} className="flex items-center gap-1.5 text-xs text-primary hover:underline"><Phone className="h-3 w-3" /> {o.buyer_phone}</a>}
                      {o.buyer_tpn && <div className="text-xs text-muted-foreground">TPN: {o.buyer_tpn}</div>}
                    </div>

                    {o.items?.length > 0 && (
                      <div className="text-xs text-muted-foreground rounded-lg border border-border divide-y divide-border">
                        {o.items.map((i, idx) => (
                          <div key={idx} className="flex justify-between px-3 py-1.5">
                            <span>{i.name} × {i.quantity}</span>
                            <span>Nu. {Number(i.total || 0).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {actions.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {busyId === o.cloud_id ? (
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Working…</span>
                        ) : actions.map((a) => (
                          <Button key={a.to} onClick={() => advance(o, a.to)}
                            variant={a.danger ? "outline" : "default"}
                            className={a.danger ? "text-tibetan border-tibetan/30 hover:bg-tibetan/10" : ""}>
                            {a.danger && <XCircle className="h-4 w-4 mr-1.5" />}{a.label}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <Dialog open={!!cancelFor} onOpenChange={(v) => { if (!v) { setCancelFor(null); setCancelReason(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancel order {cancelFor?.order_no}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This returns the stock on both sides and reverses any credit. The buyer is notified.</p>
          <textarea placeholder="Reason (optional)" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCancelFor(null); setCancelReason(""); }}>Keep order</Button>
            <Button className="bg-tibetan hover:bg-tibetan/90 text-white" onClick={doCancel} disabled={busyId === cancelFor?.cloud_id}>
              {busyId === cancelFor?.cloud_id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
