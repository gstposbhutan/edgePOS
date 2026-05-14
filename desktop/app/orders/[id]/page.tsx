"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getPB } from "@/lib/pb-client";
import { formatDateTime } from "@/lib/date-utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  ArrowLeft,
  ClipboardList,
  Banknote,
  Smartphone,
  Landmark,
  CreditCard,
  ShieldCheck,
  Receipt,
  Tag,
  Percent,
} from "lucide-react";

const PAYMENT_ICONS: Record<string, React.ReactNode> = {
  cash: <Banknote className="h-4 w-4" />,
  mbob: <Smartphone className="h-4 w-4" />,
  mpay: <Smartphone className="h-4 w-4" />,
  rtgs: <Landmark className="h-4 w-4" />,
  credit: <CreditCard className="h-4 w-4" />,
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  mbob: "mBoB",
  mpay: "mPay",
  rtgs: "RTGS",
  credit: "Khata / Credit",
};

const STATUS_CLASS: Record<string, string> = {
  CONFIRMED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  CANCELLED: "bg-destructive/10 text-destructive border-destructive/30",
  REFUNDED: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  DRAFT: "bg-muted text-muted-foreground border-border",
};

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const pb = getPB();

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrder = useCallback(async () => {
    if (!id) return;
    try {
      const record = await pb.collection("orders").getOne(id, {
        expand: "created_by,buyer_id",
        requestKey: null,
      });
      setOrder(record);
    } catch (err: any) {
      toast.error(err.message || "Failed to load order");
    } finally {
      setLoading(false);
    }
  }, [id, pb]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  const handlePrint = () => {
    if (!order) return;
    const printWin = window.open("", "_blank", "width=400,height=600");
    if (!printWin) return;

    const items = order.items || [];
    const itemsHtml = items.map((item: any) => `
      <tr>
        <td style="padding:4px 0;font-size:14px">${item.name}${item.sku ? ` (${item.sku})` : ""}</td>
        <td style="text-align:right;padding:4px 0">${item.quantity} × Nu.${item.unit_price?.toFixed(2)}</td>
        <td style="text-align:right;padding:4px 0">Nu.${item.total?.toFixed(2)}</td>
      </tr>
      ${item.discount > 0 ? `<tr><td colspan="3" style="text-align:right;font-size:12px;color:#888">
        Disc ${item.discount_type === "PERCENTAGE" ? `${item.discount}%` : `Nu.${item.discount?.toFixed(2)}`} per unit
      </td></tr>` : ""}
    `).join("");

    const html = `
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"><title>Invoice ${order.order_no}</title>
      <style>
        body { font-family: monospace; font-size: 14px; max-width: 400px; margin: 0 auto; padding: 16px; }
        .center { text-align: center; }
        .right { text-align: right; }
        .bold { font-weight: bold; }
        table { width: 100%; border-collapse: collapse; }
        hr { border: none; border-top: 1px dashed #ccc; margin: 8px 0; }
      </style></head>
      <body>
        <div class="center">
          <h2 style="margin:0">NEXUS BHUTAN POS</h2>
          <p style="margin:2px 0;font-size:12px">TPN/GSTIN: ${order.seller_id || "N/A"}</p>
          <p style="margin:2px 0;font-size:12px">Invoice: ${order.order_no}</p>
          <p style="margin:2px 0;font-size:12px">${formatDateTime(order.created_at)}</p>
        </div>
        <hr>
        <table>
          ${itemsHtml}
        </table>
        <hr>
        <div class="right">
          <p>Subtotal: Nu.${order.subtotal?.toFixed(2)}</p>
          <p>GST (5%): Nu.${order.gst_total?.toFixed(2)}</p>
          <p class="bold">Total: Nu.${order.grand_total?.toFixed(2)}</p>
        </div>
        <hr>
        <div class="center">
          <p style="font-size:12px">Payment: ${PAYMENT_LABELS[order.payment_method] || order.payment_method}</p>
          ${order.payment_ref ? `<p style="font-size:12px">Ref: ${order.payment_ref}</p>` : ""}
          ${order.digital_signature ? `<p style="font-size:10px;word-break:break-all;color:#888">Sig: ${order.digital_signature}</p>` : ""}
          <p style="font-size:12px;margin-top:12px">Thank you!</p>
        </div>
        <script>window.print();window.close();</script>
      </body></html>`;
    printWin.document.write(html);
    printWin.document.close();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Order not found</p>
          <Link href="/orders">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Orders
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const items = order.items || [];
  const statusStyle = STATUS_CLASS[order.status] || STATUS_CLASS.DRAFT;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/orders">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Orders
            </Button>
          </Link>
          <h1 className="font-serif font-bold text-lg">Order Detail</h1>
        </div>
        <Button size="sm" variant="outline" onClick={handlePrint}>
          <Receipt className="h-4 w-4 mr-1" />
          Print Invoice
        </Button>
      </header>

      <main className="p-4 max-w-3xl mx-auto space-y-4">
        {/* Order Summary Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{order.order_no}</CardTitle>
              <Badge className={statusStyle}>{order.status}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Date</p>
                <p className="font-mono">{formatDateTime(order.created_at)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Payment Method</p>
                <p className="flex items-center gap-1.5">
                  {PAYMENT_ICONS[order.payment_method]}
                  {PAYMENT_LABELS[order.payment_method] || order.payment_method}
                </p>
              </div>
              {order.payment_ref && (
                <div>
                  <p className="text-muted-foreground text-xs">Reference</p>
                  <p>{order.payment_ref}</p>
                </div>
              )}
              {order.customer_name && (
                <div>
                  <p className="text-muted-foreground text-xs">Customer</p>
                  <p>{order.customer_name}{order.customer_phone ? ` · ${order.customer_phone}` : ""}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Items Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Items ({items.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Disc</TableHead>
                  <TableHead className="text-right">GST</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">
                      <span>{item.name}</span>
                      {item.sku && <p className="text-[10px] text-muted-foreground">{item.sku}</p>}
                    </TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">Nu. {item.unit_price?.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      {item.discount > 0 ? (
                        <span className="flex items-center justify-end gap-1">
                          {item.discount_type === "PERCENTAGE" ? (
                            <Percent className="h-3 w-3" />
                          ) : (
                            <Tag className="h-3 w-3" />
                          )}
                          {item.discount_type === "PERCENTAGE"
                            ? `${item.discount}%`
                            : `Nu.${item.discount?.toFixed(2)}`}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">Nu. {item.gst_5?.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-medium">Nu. {item.total?.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Totals Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Totals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>Nu. {order.subtotal?.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">GST (5%)</span>
              <span>Nu. {order.gst_total?.toFixed(2)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-base font-bold">
              <span>Grand Total</span>
              <span>Nu. {order.grand_total?.toFixed(2)}</span>
            </div>
            {order.refund_amount > 0 && (
              <div className="flex justify-between text-sm text-amber-400">
                <span>Refunded</span>
                <span>-Nu. {order.refund_amount?.toFixed(2)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* GST & Digital Signature */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              GST Compliance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Order Number</span>
              <span className="font-mono">{order.order_no}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">GST Rate</span>
              <span>5%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">GST Amount</span>
              <span>Nu. {order.gst_total?.toFixed(2)}</span>
            </div>
            {order.digital_signature && (
              <div className="pt-2">
                <p className="text-muted-foreground text-xs mb-1">Digital Signature (SHA-256)</p>
                <p className="font-mono text-[10px] break-all bg-muted/50 rounded p-2">
                  {order.digital_signature}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cancellation/Refund Info */}
        {(order.status === "CANCELLED" || order.status === "REFUNDED") && (
          <Card className="border-destructive/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-destructive">
                {order.status === "CANCELLED" ? "Cancellation" : "Refund"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {order.cancellation_reason && (
                <div>
                  <p className="text-muted-foreground text-xs">Reason</p>
                  <p>{order.cancellation_reason}</p>
                </div>
              )}
              {order.refund_reason && (
                <div>
                  <p className="text-muted-foreground text-xs">Refund Reason</p>
                  <p>{order.refund_reason}</p>
                </div>
              )}
              {order.refund_amount > 0 && (
                <div>
                  <p className="text-muted-foreground text-xs">Refund Amount</p>
                  <p className="text-amber-400 font-medium">Nu. {order.refund_amount?.toFixed(2)}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
