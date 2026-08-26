"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { useOnlineOrders, type OnlineOrder } from "@/hooks/use-online-orders";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OfficeShell } from "@/components/office/office-shell";
import { OfficeGrid } from "@/components/office/office-grid";
import { REPORT_KEYS, withHandlers } from "@/lib/office-keys";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft, RefreshCw, ShoppingBag, MapPin, Phone, Mail, Store, KeyRound,
  Truck, AlertTriangle, Loader2, CheckCircle, XCircle,
} from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    CONFIRMED: "text-blue-600 border-blue-500/30 bg-blue-500/10",
    PROCESSING: "text-amber-600 border-amber-500/30 bg-amber-500/10",
    DISPATCHED: "text-emerald-600 border-emerald-500/30 bg-emerald-500/10",
  };
  return <Badge variant="outline" className={map[status] || "text-muted-foreground"}>{status}</Badge>;
}

// Rider handoff panel: the pickup code to read to the rider, or the current dispatch state.
function RiderHandoff({ o }: { o: OnlineOrder }) {
  if (o.fulfilment_mode === "PICKUP") {
    return <div className="text-xs text-muted-foreground">Customer collects in store — no rider.</div>;
  }
  if (o.status === "DISPATCHED") {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-600">
        <Truck className="h-4 w-4" /> Picked up{o.rider_name ? ` by ${o.rider_name}` : ""} — out for delivery
      </div>
    );
  }
  if (o.dispatch_state === "UNDELIVERABLE") {
    return (
      <div className="flex items-center gap-2 text-sm text-tibetan">
        <AlertTriangle className="h-4 w-4" /> No rider available — cancel or wait for one to come online
      </div>
    );
  }
  if (!o.rider_name || !o.pickup_otp) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Finding a rider…
      </div>
    );
  }
  // Rider assigned + pickup OTP — share this with the rider at collection.
  return (
    <div className="rounded-lg border border-gold/30 bg-gold/5 p-3 space-y-1">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <KeyRound className="h-3.5 w-3.5" /> Pickup code — give to {o.rider_name}
      </div>
      <div className="text-3xl font-mono font-bold tracking-[0.3em] text-center py-1 text-gold">{o.pickup_otp}</div>
    </div>
  );
}

export default function OnlineOrdersPage() {
  const { isManager, isOwner } = useAuth();
  const { orders, loading, refresh, act } = useOnlineOrders();
  const [openOrder, setOpenOrder] = useState<OnlineOrder | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelFor, setCancelFor] = useState<OnlineOrder | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  async function confirmOrder(o: OnlineOrder) {
    setBusyId(o.cloud_id);
    const res = await act(o.cloud_id, "confirm");
    setBusyId(null);
    if (res.ok) toast.success(`Order ${o.order_no} confirmed`);
    else toast.error(res.error || "Could not confirm");
  }

  async function doCancel() {
    if (!cancelFor) return;
    const o = cancelFor;
    setBusyId(o.cloud_id);
    const res = await act(o.cloud_id, "cancel", cancelReason.trim() || undefined);
    setBusyId(null);
    setCancelFor(null);
    setCancelReason("");
    if (res.ok) toast.success(`Order ${o.order_no} cancelled`);
    else toast.error(res.error || "Could not cancel");
  }

  // The online order register (spec WF-09). Same shape as the B2B register: the lines and the
  // rider details do not fit a row, so the row opens the order and the sheet carries the actions.
  const orderRows = orders.map((o) => ({
    id: o.id,
    _o: o,
    order_no: o.order_no,
    customer: o.customer_name || o.customer_phone || o.customer_email || "—",
    phone: o.customer_phone || "—",
    mode: o.fulfilment_mode || "—",
    status: o.status,
    total: Number(o.grand_total ?? 0).toFixed(2),
  }));

  const ORDER_COLUMNS = [
    { key: "order_no", label: "Order No", width: 170 },
    { key: "customer", label: "Customer" },
    { key: "phone",    label: "Phone",    width: 140 },
    { key: "mode",     label: "Fulfilment", width: 120 },
    { key: "status",   label: "Status",   width: 150 },
    { key: "total",    label: "Amount",   width: 120, align: "right" as const },
  ];

  const total = orders.reduce((sum, o) => sum + Number(o.grand_total ?? 0), 0);

  return (
    <OfficeShell
      crumb="Customer Service"
      title="Online Order Register"
      keys={[
        { key: "R", label: "Refresh", onClick: refresh },
        ...withHandlers(REPORT_KEYS, {}),
      ]}
    >
      <div className="flex flex-wrap items-center gap-3 mb-3 text-[12px]">
        <span className="opacity-75">{orders.length} order{orders.length === 1 ? "" : "s"}</span>
        <span className="ml-auto opacity-60">Enter opens the order.</span>
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
          empty="No online orders right now. New marketplace orders appear here automatically."
        />
      )}

      <Dialog open={!!openOrder} onOpenChange={(v) => { if (!v) setOpenOrder(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{openOrder?.order_no}</DialogTitle></DialogHeader>
          {openOrder && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{openOrder.customer_name || "Customer"}</span>
                <StatusBadge status={openOrder.status} />
              </div>
              {openOrder.customer_phone && <div className="text-xs text-muted-foreground">{openOrder.customer_phone}</div>}
              {openOrder.delivery_address && <div className="text-xs text-muted-foreground">{openOrder.delivery_address}</div>}
              <RiderHandoff o={openOrder} />
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-muted-foreground">{openOrder.fulfilment_mode}</span>
                <span className="font-semibold text-primary">Nu. {Number(openOrder.grand_total ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex gap-2 pt-1">
                <Button onClick={() => confirmOrder(openOrder)} disabled={busyId === openOrder.cloud_id} className="flex-1">
                  {busyId === openOrder.cloud_id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
                </Button>
                <Button variant="outline" onClick={() => setCancelFor(openOrder)} disabled={busyId === openOrder.cloud_id}
                  className="flex-1 text-tibetan border-tibetan/30 hover:bg-tibetan/10">
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancelFor} onOpenChange={(v) => { if (!v) { setCancelFor(null); setCancelReason(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancel order {cancelFor?.order_no}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This releases any assigned rider and notifies the customer. Stock is returned.</p>
          <textarea
            placeholder="Reason (optional)"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
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
