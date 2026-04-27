"use client";

import { useState } from "react";
import Link from "next/link";
import { useOrders } from "@/hooks/use-orders";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft,
  ClipboardList,
  Search,
  Printer,
  RotateCcw,
  XCircle,
} from "lucide-react";

export default function OrdersPage() {
  const { orders, loading, filter, setFilter, cancelOrder, refundOrder, refresh } = useOrders();
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  const filtered = orders.filter(
    (o) =>
      o.order_no.toLowerCase().includes(search.toLowerCase()) ||
      o.customer_name?.toLowerCase().includes(search.toLowerCase())
  );

  const handleCancel = async (orderId: string) => {
    const reason = prompt("Cancellation reason:");
    if (!reason) return;
    const result = await cancelOrder(orderId, reason);
    if (result.success) {
      toast.success("Order cancelled");
      refresh();
    } else {
      toast.error(result.error);
    }
  };

  const handlePrint = (order: any) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const items = order.items || [];
    const date = order.created_at ? new Date(order.created_at).toLocaleString() : "";
    printWindow.document.write(`
      <html><head><title>Receipt ${order.order_no}</title>
      <style>
        body { font-family: sans-serif; padding: 20px; max-width: 320px; margin: 0 auto; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { padding: 4px; text-align: left; }
        .right { text-align: right; }
        .total { font-weight: bold; border-top: 1px solid #000; margin-top: 8px; padding-top: 8px; }
      </style></head><body>
      <h2>${order.expand?.customer?.name || "NEXUS BHUTAN"}</h2>
      <p>Invoice: ${order.order_no}</p>
      <p>Date: ${date}</p>
      <table><thead><tr><th>Item</th><th class="right">Qty</th><th class="right">Total</th></tr></thead><tbody>
      ${items.map((i: any) => `<tr><td>${i.name}</td><td class="right">${i.quantity}</td><td class="right">${i.total.toFixed(2)}</td></tr>`).join("")}
      </tbody></table>
      <div class="total">Total: Nu. ${order.grand_total.toFixed(2)}</div>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              POS
            </Button>
          </Link>
          <h1 className="font-serif font-bold text-lg">Orders</h1>
        </div>
      </header>

      <main className="p-4 max-w-5xl mx-auto space-y-4">
        <div className="flex gap-2 flex-wrap">
          {["all", "today", "confirmed", "cancelled", "refunded"].map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search orders..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <p className="text-muted-foreground text-center py-8">Loading...</p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.order_no}</TableCell>
                    <TableCell>{order.customer_name || "—"}</TableCell>
                    <TableCell className="uppercase text-xs">{order.payment_method}</TableCell>
                    <TableCell className="text-right font-medium">
                      Nu. {order.grand_total.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {order.status === "CONFIRMED" ? (
                        <Badge variant="secondary" className="text-xs">Confirmed</Badge>
                      ) : order.status === "CANCELLED" ? (
                        <Badge variant="destructive" className="text-xs">Cancelled</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">{order.status}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedOrder(order)}
                        >
                          View
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handlePrint(order)}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                        {order.status === "CONFIRMED" && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => handleCancel(order.id)}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-warning"
                              onClick={() => {
                                const reason = prompt("Refund reason:");
                                if (reason) {
                                  refundOrder(order.id, [], reason).then((r) => {
                                    if (r.success) {
                                      toast.success("Order refunded");
                                      refresh();
                                    } else {
                                      toast.error(r.error);
                                    }
                                  });
                                }
                              }}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </main>

      {/* Order Detail Modal */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Order {selectedOrder?.order_no}</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                <span>Date:</span>
                <span>{selectedOrder.created_at ? new Date(selectedOrder.created_at).toLocaleString() : ""}</span>
                <span>Customer:</span>
                <span>{selectedOrder.customer_name || "—"}</span>
                <span>Payment:</span>
                <span className="uppercase">{selectedOrder.payment_method}</span>
                <span>Reference:</span>
                <span>{selectedOrder.payment_ref || "—"}</span>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-2">Item</th>
                      <th className="text-right p-2">Qty</th>
                      <th className="text-right p-2">Price</th>
                      <th className="text-right p-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedOrder.items || []).map((item: any, i: number) => (
                      <tr key={i} className="border-t">
                        <td className="p-2">{item.name}</td>
                        <td className="text-right p-2">{item.quantity}</td>
                        <td className="text-right p-2">{item.unit_price.toFixed(2)}</td>
                        <td className="text-right p-2 font-medium">{item.total.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-1 text-right">
                <p>Subtotal: Nu. {selectedOrder.subtotal.toFixed(2)}</p>
                <p>GST: Nu. {selectedOrder.gst_total.toFixed(2)}</p>
                <p className="text-lg font-bold">Total: Nu. {selectedOrder.grand_total.toFixed(2)}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
