"use client";

import { useState } from "react";
import Link from "next/link";
import { useRequireRole } from "@/hooks/use-require-role";
import { useB2bOrders, type B2bOrder } from "@/hooks/use-b2b-orders";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OfficeShell } from "@/components/office/office-shell";
import { OfficeGrid } from "@/components/office/office-grid";
import { REPORT_KEYS, withHandlers } from "@/lib/office-keys";
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
  useRequireRole(["owner", "manager"] as const); // wholesale/purchase orders — manager+ (super_admin bypasses)
  const { orders, loading, refresh, act } = useB2bOrders();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openOrder, setOpenOrder] = useState<B2bOrder | null>(null);
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

  // The purchase order register (spec WF-09) — incoming B2B orders, scannable.
  //
  // The lines of an order do not fit a register row, and dropping them would leave a shopkeeper
  // accepting an order they cannot see. So the row opens the order: the register is for finding
  // it, the sheet is for reading and acting on it. That is how a voucher works on the incumbent.
  const orderRows = orders.map((o) => ({
    id: o.id,
    _o: o,
    order_no: o.order_no,
    buyer: o.buyer_name || "Buyer",
    phone: o.buyer_phone || "—",
    method: o.payment_method || "—",
    status: o.status,
    items: `${o.items?.length ?? 0}`,
    total: Number(o.grand_total).toFixed(2),
  }));

  const ORDER_COLUMNS = [
    { key: "order_no", label: "Order No", width: 170 },
    { key: "buyer",    label: "Buyer" },
    { key: "phone",    label: "Phone",   width: 140 },
    { key: "method",   label: "Payment", width: 110 },
    { key: "status",   label: "Status",  width: 150 },
    { key: "items",    label: "Lines",   width: 70,  align: "right" as const },
    { key: "total",    label: "Amount",  width: 120, align: "right" as const },
  ];

  const total = orders.reduce((sum, o) => sum + Number(o.grand_total ?? 0), 0);

  return (
    <OfficeShell
      crumb="Purchase Management"
      title="Purchase Order Register"
      keys={[
        { key: "R", label: "Refresh", onClick: refresh },
        ...withHandlers(REPORT_KEYS, {}),
      ]}
    >
      <div className="flex flex-wrap items-center gap-3 mb-3 text-[12px]">
        <span className="opacity-75">{orders.length} incoming order{orders.length === 1 ? "" : "s"}</span>
        <span className="ml-auto opacity-60">Enter opens the order and its lines.</span>
      </div>

      {loading ? (
        <p className="text-[12px] opacity-60 p-4">Loading…</p>
      ) : (
        <OfficeGrid
          columns={ORDER_COLUMNS}
          rows={orderRows}
          totals={{ order_no: "Total", total: total.toFixed(2) }}
          onOpen={(row) => setOpenOrder(row._o)}
          openOnClick
          empty="No incoming B2B orders right now. Orders your buyers place appear here automatically."
        />
      )}

      {/* The order itself: its lines, and the actions its status allows. */}
      <Dialog open={!!openOrder} onOpenChange={(v) => { if (!v) setOpenOrder(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{openOrder?.order_no}</DialogTitle></DialogHeader>
          {openOrder && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{openOrder.buyer_name || "Buyer"}</span>
                <StatusBadge status={openOrder.status} />
              </div>
              {openOrder.buyer_phone && <div className="text-xs text-muted-foreground">{openOrder.buyer_phone}</div>}
              {openOrder.buyer_tpn && <div className="text-xs text-muted-foreground">TPN: {openOrder.buyer_tpn}</div>}

              {openOrder.items?.length > 0 && (
                <div className="text-xs rounded-lg border border-border divide-y divide-border">
                  {openOrder.items.map((i, idx) => (
                    <div key={idx} className="flex justify-between px-3 py-1.5">
                      <span>{i.name} × {i.quantity}</span>
                      <span>Nu. {Number(i.total || 0).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-muted-foreground">{openOrder.payment_method}</span>
                <span className="font-semibold text-primary">Nu. {Number(openOrder.grand_total).toFixed(2)}</span>
              </div>

              {(NEXT_ACTIONS[openOrder.status] || []).length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {busyId === openOrder.cloud_id ? (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Working…</span>
                  ) : (NEXT_ACTIONS[openOrder.status] || []).map((a) => (
                    <Button key={a.to} onClick={() => advance(openOrder, a.to)}
                      variant={a.danger ? "outline" : "default"}
                      className={a.danger ? "text-tibetan border-tibetan/30 hover:bg-tibetan/10" : ""}>
                      {a.danger && <XCircle className="h-4 w-4 mr-1.5" />}{a.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

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
    </OfficeShell>
  );
}
