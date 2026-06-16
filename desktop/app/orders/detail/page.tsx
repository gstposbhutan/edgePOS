"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getPB } from "@/lib/pb-client";
import { formatDateTime } from "@/lib/date-utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PELBU_ICON_DATA_URI } from "@/lib/pelbu-icon-data";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Printer,
  ShieldCheck,
  Clock,
} from "lucide-react";

const STATUS_CLASS: Record<string, string> = {
  CONFIRMED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  CANCELLED: "bg-destructive/10 text-destructive border-destructive/30",
  REFUNDED: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  DRAFT: "bg-muted text-muted-foreground border-border",
};

interface StatusLog {
  id: string;
  from_status: string;
  to_status: string;
  reason: string;
  actor_role: string;
  created: string;
}

function OrderDetailContent() {
  const id = useSearchParams().get("id") || "";
  const pb = getPB();
  const [order, setOrder] = useState<any>(null);
  const [timeline, setTimeline] = useState<StatusLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrder = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    try {
      const record = await pb.collection("orders").getOne(id, {
        expand: "created_by",
        requestKey: null,
      });
      setOrder(record);
      // Status timeline (order_status_log) — best-effort; collection may be empty.
      try {
        const logs = await pb.collection("order_status_log").getFullList<StatusLog>({
          filter: `order = "${id}"`,
          sort: "created",
          requestKey: null,
        });
        setTimeline(logs);
      } catch {
        setTimeline([]);
      }
    } catch {
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [id, pb]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  const handlePrint = () => {
    if (!order) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const items = order.items || [];
    const date = order.created ? new Date(order.created).toLocaleString() : "";
    printWindow.document.write(`
      <html><head><title>Invoice ${order.order_no}</title>
      <style>
        body { font-family: sans-serif; padding: 20px; max-width: 320px; margin: 0 auto; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { padding: 4px; text-align: left; }
        .right { text-align: right; }
        .total { font-weight: bold; border-top: 1px solid #000; margin-top: 8px; padding-top: 8px; }
      </style></head><body>
      <img src="${PELBU_ICON_DATA_URI}" alt="Pelbu" style="height:48px;display:block;margin:0 auto 4px" />
      <h2 style="text-align:center">Pelbu</h2>
      <p>Invoice: ${order.order_no}</p>
      <p>Date: ${date}</p>
      <table><thead><tr><th>Item</th><th class="right">Qty</th><th class="right">Total</th></tr></thead><tbody>
      ${items.map((i: any) => `<tr><td>${i.name}</td><td class="right">${i.quantity}</td><td class="right">${(i.total || 0).toFixed(2)}</td></tr>`).join("")}
      </tbody></table>
      <div class="total">Subtotal: Nu. ${(order.subtotal || 0).toFixed(2)}</div>
      <div>GST 5%: Nu. ${(order.gst_total || 0).toFixed(2)}</div>
      <div class="total">Total: Nu. ${(order.grand_total || 0).toFixed(2)}</div>
      ${order.digital_signature ? `<p style="font-size:9px;word-break:break-all;">Sig: ${order.digital_signature}</p>` : ""}
      </body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>;
  }
  if (!order) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">Order not found</p>
          <Link href="/orders"><Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Back to Orders</Button></Link>
        </div>
      </div>
    );
  }

  const items = order.items || [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/orders">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Orders</Button>
          </Link>
          <h1 className="font-serif font-bold text-lg">{order.order_no}</h1>
          <Badge variant="outline" className={`text-xs ${STATUS_CLASS[order.status] || ""}`}>{order.status}</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={handlePrint}><Printer className="h-4 w-4 mr-1" />Print Invoice</Button>
      </header>

      <main className="p-4 max-w-3xl mx-auto space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Date</p>
            <p className="text-sm font-medium">{formatDateTime(order.created)}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Payment</p>
            <p className="text-sm font-medium uppercase">{order.payment_channel || order.payment_method}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Customer</p>
            <p className="text-sm font-medium">{order.customer_name || "Walk-in"}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Cashier</p>
            <p className="text-sm font-medium">{order.expand?.created_by?.name || "—"}</p>
          </div>
        </div>

        {/* Items */}
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Disc</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i: any, idx: number) => (
                <TableRow key={i.id || idx}>
                  <TableCell className="font-medium">{i.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{i.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">Nu. {(i.unit_price || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-nums">{i.discount ? `Nu. ${i.discount.toFixed(2)}` : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">Nu. {(i.total || 0).toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Totals */}
        <div className="rounded-lg border border-border p-4 space-y-1 max-w-xs ml-auto text-sm">
          <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="tabular-nums">Nu. {(order.subtotal || 0).toFixed(2)}</span></div>
          <div className="flex justify-between text-muted-foreground"><span>GST 5%</span><span className="tabular-nums">Nu. {(order.gst_total || 0).toFixed(2)}</span></div>
          <div className="flex justify-between font-bold border-t border-border pt-1"><span>Grand Total</span><span className="tabular-nums">Nu. {(order.grand_total || 0).toFixed(2)}</span></div>
          {order.refund_amount > 0 && (
            <div className="flex justify-between text-amber-400"><span>Refunded</span><span className="tabular-nums">Nu. {order.refund_amount.toFixed(2)}</span></div>
          )}
        </div>

        {/* Digital signature */}
        {order.digital_signature && (
          <div className="rounded-lg border border-border p-3 flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Digital signature (SHA-256 of order_no:grand_total:TPN)</p>
              <p className="text-xs font-mono break-all">{order.digital_signature}</p>
            </div>
          </div>
        )}

        {/* Status timeline */}
        {timeline.length > 0 && (
          <div className="rounded-lg border border-border p-4 space-y-2">
            <p className="text-sm font-medium flex items-center gap-1.5"><Clock className="h-4 w-4" />Timeline</p>
            {timeline.map((log) => (
              <div key={log.id} className="flex items-center gap-2 text-sm">
                <Badge variant="outline" className="text-xs">{log.to_status}</Badge>
                <span className="text-muted-foreground text-xs">{formatDateTime(log.created)}</span>
                {log.reason && <span className="text-muted-foreground text-xs">— {log.reason}</span>}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function OrderDetailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>}>
      <OrderDetailContent />
    </Suspense>
  );
}
