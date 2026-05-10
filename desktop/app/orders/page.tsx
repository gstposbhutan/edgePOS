"use client";

import { useState } from "react";
import Link from "next/link";
import { useOrders } from "@/hooks/use-orders";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
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
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft,
  ClipboardList,
  Search,
  Printer,
  RotateCcw,
  XCircle,
  CheckSquare,
  Square,
  Minus,
  Plus,
} from "lucide-react";

type RefundSelection = Record<string, number>;

export default function OrdersPage() {
  const { orders, loading, filter, setFilter, cancelOrder, refundOrder, refresh } = useOrders();
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [refundSelections, setRefundSelections] = useState<RefundSelection>({});
  const [showRefundUI, setShowRefundUI] = useState(false);

  const filtered = orders.filter(
    (o) =>
      o.order_no.toLowerCase().includes(search.toLowerCase()) ||
      o.customer_name?.toLowerCase().includes(search.toLowerCase())
  );

  const openOrder = (order: any) => {
    setSelectedOrder(order);
    setRefundSelections({});
    setShowRefundUI(false);
  };

  const toggleRefundItem = (itemId: string, maxQty: number) => {
    setRefundSelections((prev) => {
      const next = { ...prev };
      if (next[itemId]) {
        delete next[itemId];
      } else {
        next[itemId] = maxQty;
      }
      return next;
    });
  };

  const setRefundQty = (itemId: string, qty: number, maxQty: number) => {
    const clamped = Math.min(Math.max(1, qty), maxQty);
    setRefundSelections((prev) => ({ ...prev, [itemId]: clamped }));
  };

  const selectedRefundItems = Object.entries(refundSelections).map(([itemId, qty]) => ({
    itemId,
    qty,
  }));

  const refundSubtotal = selectedOrder
    ? selectedRefundItems.reduce((sum: number, ri: { itemId: string; qty: number }) => {
        const item = (selectedOrder.items || []).find((i: any) => i.id === ri.itemId);
        if (item) {
          const ratio = ri.qty / item.quantity;
          return sum + item.total * ratio;
        }
        return sum;
      }, 0)
    : 0;

  const handleCancel = async (orderId: string) => {
    const reason = prompt("Cancellation reason:");
    if (!reason) return;
    const result = await cancelOrder(orderId, reason);
    if (result.success) {
      toast.success("Order cancelled — stock restored");
      refresh();
    } else {
      toast.error(result.error);
    }
  };

  const handleFullRefund = async (orderId: string) => {
    const reason = prompt("Refund reason:");
    if (!reason) return;
    const result = await refundOrder(orderId, [], reason);
    if (result.success) {
      toast.success("Full refund — stock restored");
      refresh();
      setSelectedOrder(null);
    } else {
      toast.error(result.error);
    }
  };

  const handlePartialRefund = async () => {
    if (!selectedOrder) return;
    if (selectedRefundItems.length === 0) {
      toast.error("Select at least one item to refund");
      return;
    }
    const reason = prompt("Refund reason:");
    if (!reason) return;
    const result = await refundOrder(selectedOrder.id, selectedRefundItems, reason);
    if (result.success) {
      const itemNames = selectedRefundItems
        .map((ri) => {
          const item = selectedOrder.items.find((i: any) => i.id === ri.itemId);
          return item ? `${item.name} (x${ri.qty})` : "";
        })
        .filter(Boolean)
        .join(", ");
      toast.success(`Partial refund: ${itemNames} — stock restored`);
      refresh();
      setSelectedOrder(null);
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
                          onClick={() => openOrder(order)}
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
                              onClick={() => handleFullRefund(order.id)}
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
            <DialogDescription>
              {selectedOrder?.status === "CONFIRMED" && "Use checkboxes to select items for partial refund"}
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4 text-sm">
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

              {/* Items table with checkboxes for partial refund */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      {selectedOrder.status === "CONFIRMED" && (
                        <th className="w-8 p-2"></th>
                      )}
                      <th className="text-left p-2">Item</th>
                      <th className="text-right p-2">Qty</th>
                      <th className="text-right p-2">Price</th>
                      <th className="text-right p-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedOrder.items || []).map((item: any, i: number) => {
                      const isSelected = !!refundSelections[item.id];
                      const refundQty = refundSelections[item.id] || item.quantity;

                      return (
                        <tr key={i} className={`border-t ${isSelected ? "bg-warning/5" : ""}`}>
                          {selectedOrder.status === "CONFIRMED" && (
                            <td className="p-2">
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => toggleRefundItem(item.id, item.quantity)}
                              >
                                {isSelected ? (
                                  <CheckSquare className="h-4 w-4 text-warning" />
                                ) : (
                                  <Square className="h-4 w-4 text-muted-foreground" />
                                )}
                              </Button>
                            </td>
                          )}
                          <td className="p-2">
                            <span className={isSelected ? "line-through text-muted-foreground" : ""}>
                              {item.name}
                            </span>
                            {isSelected && (
                              <span className="text-warning text-xs ml-2">(refunding)</span>
                            )}
                          </td>
                          <td className="text-right p-2">
                            {isSelected && item.quantity > 1 ? (
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  onClick={() => setRefundQty(item.id, refundQty - 1, item.quantity)}
                                  className="hover:bg-warning/20"
                                >
                                  <Minus className="h-2.5 w-2.5" />
                                </Button>
                                <span className="w-5 text-center text-xs font-medium">{refundQty}</span>
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  onClick={() => setRefundQty(item.id, refundQty + 1, item.quantity)}
                                  className="hover:bg-warning/20"
                                >
                                  <Plus className="h-2.5 w-2.5" />
                                </Button>
                                <span className="text-muted-foreground text-[10px]">/ {item.quantity}</span>
                              </div>
                            ) : (
                              <span className={isSelected ? "text-warning font-medium" : ""}>
                                {isSelected ? refundQty : item.quantity}
                              </span>
                            )}
                          </td>
                          <td className="text-right p-2">
                            Nu. {item.unit_price.toFixed(2)}
                          </td>
                          <td className="text-right p-2 font-medium">
                            Nu. {item.total.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="space-y-1 text-right">
                <p>Subtotal: Nu. {selectedOrder.subtotal.toFixed(2)}</p>
                <p>GST: Nu. {selectedOrder.gst_total.toFixed(2)}</p>
                <p className="text-lg font-bold">Total: Nu. {selectedOrder.grand_total.toFixed(2)}</p>
                {selectedRefundItems.length > 0 && (
                  <>
                    <Separator className="my-2" />
                    <p className="text-sm text-warning">
                      Refunding: {selectedRefundItems.length} item(s)
                    </p>
                    <p className="text-sm text-warning font-medium">
                      Refund Amount: Nu. {refundSubtotal.toFixed(2)}
                    </p>
                  </>
                )}
              </div>

              {/* Action buttons */}
              {selectedOrder.status === "CONFIRMED" && (
                <div className="flex gap-2 pt-2">
                  {selectedRefundItems.length > 0 ? (
                    <Button
                      className="flex-1"
                      variant="default"
                      onClick={handlePartialRefund}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Refund Selected ({selectedRefundItems.length} items)
                    </Button>
                  ) : (
                    <Button
                      className="flex-1"
                      variant="outline"
                      onClick={() => handleFullRefund(selectedOrder.id)}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Full Refund
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => {
                      handleCancel(selectedOrder.id);
                      setSelectedOrder(null);
                    }}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Cancel Order
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
