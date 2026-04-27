"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Printer, CheckCircle, Zap } from "lucide-react";
import type { Settings } from "@/hooks/use-settings";
import { usePlatform } from "@/hooks/use-platform";
import { useState, useEffect } from "react";

interface ReceiptModalProps {
  open: boolean;
  onClose: () => void;
  order: any;
  settings: Settings | null;
}

export function ReceiptModal({ open, onClose, order, settings }: ReceiptModalProps) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const { isElectron, api } = usePlatform();
  const [printerStatus, setPrinterStatus] = useState<{ connected: boolean; name: string } | null>(null);

  useEffect(() => {
    if (isElectron && api) {
      api.printer.getStatus().then(setPrinterStatus);
    }
  }, [isElectron, api, open]);

  const handleThermalPrint = async () => {
    if (!api) return;
    const result = await api.printer.print(order, settings);
    if (result.success) {
      toast.success("Receipt printed");
    } else {
      toast.error(result.error || "Print failed");
    }
  };

  const handlePrint = () => {
    const content = receiptRef.current;
    if (!content) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const clone = content.cloneNode(true) as HTMLElement;
    printWindow.document.write(`
      <html>
        <head>
          <title>Receipt</title>
          <style>
            body { font-family: sans-serif; padding: 20px; max-width: 320px; margin: 0 auto; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { padding: 4px; text-align: left; }
            th { border-bottom: 1px solid #ccc; }
            .right { text-align: right; }
            .total { font-weight: bold; border-top: 1px solid #000; margin-top: 8px; padding-top: 8px; }
            .signature { font-size: 10px; word-break: break-all; color: #666; margin-top: 12px; }
          </style>
        </head>
        <body></body>
      </html>
    `);
    printWindow.document.close();
    printWindow.document.body.appendChild(clone);
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  if (!order) return null;

  const date = new Date(order.created).toLocaleString("en-IN");
  const items = order.items || [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-emerald-500" />
            Order Confirmed
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Receipt */}
          <div
            ref={receiptRef}
            className="bg-white text-black p-4 rounded-lg text-sm space-y-3"
          >
            <div className="text-center border-b border-gray-200 pb-2">
              <h1 className="font-bold text-lg">{settings?.store_name || "NEXUS BHUTAN"}</h1>
              {settings?.store_address && <p className="text-xs text-gray-500">{settings.store_address}</p>}
              {settings?.tpn_gstin && <p className="text-xs text-gray-500">TPN: {settings.tpn_gstin}</p>}
              <p className="text-xs text-gray-400 mt-1">TAX INVOICE — GST 2026</p>
            </div>

            <div className="grid grid-cols-2 gap-1 text-xs">
              <span className="text-gray-500">Invoice:</span>
              <span className="font-medium text-right">{order.order_no}</span>
              <span className="text-gray-500">Date:</span>
              <span className="font-medium text-right">{date}</span>
              <span className="text-gray-500">Payment:</span>
              <span className="font-medium text-right uppercase">{order.payment_method}</span>
              {order.customer_name && (
                <>
                  <span className="text-gray-500">Customer:</span>
                  <span className="font-medium text-right">{order.customer_name}</span>
                </>
              )}
            </div>

            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="right">Qty</th>
                  <th className="right">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any, i: number) => (
                  <tr key={i}>
                    <td>{item.name}</td>
                    <td className="right">{item.quantity}</td>
                    <td className="right">{item.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal</span>
                <span>Nu. {order.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">GST @ 5%</span>
                <span>Nu. {order.gst_total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between total text-base">
                <span>TOTAL</span>
                <span>Nu. {order.grand_total.toFixed(2)}</span>
              </div>
            </div>

            {order.digital_signature && (
              <div className="signature border-t border-gray-200 pt-2">
                <p className="text-gray-500 mb-0.5">Transaction Reference</p>
                <p className="font-mono">{order.digital_signature}</p>
              </div>
            )}

            <div className="text-center text-[10px] text-gray-400 border-t border-gray-200 pt-2">
              <p>Computer-generated invoice</p>
              <p>{settings?.receipt_footer || "Thank you for your business!"}</p>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Close
            </Button>
            {isElectron && printerStatus?.connected && (
              <Button className="flex-1" variant="secondary" onClick={handleThermalPrint}>
                <Zap className="h-4 w-4 mr-2" />
                Thermal Print
              </Button>
            )}
            <Button className="flex-1" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Browser Print
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
