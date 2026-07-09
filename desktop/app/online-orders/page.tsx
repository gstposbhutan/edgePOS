"use client";

import { useState } from "react";
import Link from "next/link";
import { useOnlineOrders, type OnlineOrder } from "@/hooks/use-online-orders";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  const { orders, loading, refresh, act } = useOnlineOrders();
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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            <h1 className="font-semibold">Online Orders</h1>
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
            <ShoppingBag className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No online orders right now.</p>
            <p className="text-xs opacity-60 mt-1">New marketplace orders appear here automatically.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((o) => (
              <div key={o.id} className="border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-mono">{o.order_no}</p>
                    <p className="text-sm font-semibold text-primary">Nu. {Number(o.grand_total).toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{o.fulfilment_mode === "PICKUP" ? "Pickup" : "Delivery"}</Badge>
                    <StatusBadge status={o.status} />
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  {/* Customer */}
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-1.5 font-medium"><Store className="h-3.5 w-3.5 text-muted-foreground" /> {o.customer_name || "Customer"}</div>
                    {o.customer_phone && <a href={`tel:${o.customer_phone}`} className="flex items-center gap-1.5 text-xs text-primary hover:underline"><Phone className="h-3 w-3" /> {o.customer_phone}</a>}
                    {o.customer_email && <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="h-3 w-3" /> {o.customer_email}</div>}
                  </div>

                  {/* Delivery */}
                  {o.fulfilment_mode !== "PICKUP" && (
                    <div className="text-sm">
                      <div className="flex items-start gap-1.5">
                        <MapPin className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                        <span>{o.delivery_address || "No address provided"}</span>
                      </div>
                      {o.delivery_lat != null && (
                        <a href={`https://maps.google.com/?q=${o.delivery_lat},${o.delivery_lng}`} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline ml-5">Open in Maps →</a>
                      )}
                    </div>
                  )}

                  {/* Items */}
                  {o.items?.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      {o.items.map((i, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span>{i.name} × {i.quantity}</span>
                          <span>Nu. {Number(i.total || 0).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Rider handoff / OTP */}
                  <RiderHandoff o={o} />

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    {o.status === "CONFIRMED" && (
                      <Button onClick={() => confirmOrder(o)} disabled={busyId === o.cloud_id} className="flex-1">
                        {busyId === o.cloud_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle className="h-4 w-4 mr-1.5" /> Confirm</>}
                      </Button>
                    )}
                    {(o.status === "CONFIRMED" || o.status === "PROCESSING") && (
                      <Button variant="outline" onClick={() => setCancelFor(o)} disabled={busyId === o.cloud_id} className="flex-1 text-tibetan border-tibetan/30 hover:bg-tibetan/10">
                        <XCircle className="h-4 w-4 mr-1.5" /> Cancel
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

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
    </div>
  );
}
