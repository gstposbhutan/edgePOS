"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Printer, FileText, Calendar } from "lucide-react";
import { formatCurrency } from "@/lib/gst";
import { useShifts } from "@/hooks/use-shifts";

interface ZReportModalProps {
  open: boolean;
  onClose: () => void;
}

export function ZReportModal({ open, onClose }: ZReportModalProps) {
  const { getZReport } = useShifts();
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) loadReport();
  }, [open, date]);

  const loadReport = async () => {
    setLoading(true);
    const r = await getZReport(date);
    setReport(r);
    setLoading(false);
  };

  const handlePrint = () => {
    if (!report) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html><head><title>Z-Report ${report.date}</title>
      <style>
        body { font-family: sans-serif; padding: 20px; max-width: 400px; margin: 0 auto; }
        h1 { text-align: center; font-size: 18px; margin-bottom: 4px; }
        h2 { text-align: center; font-size: 14px; color: #666; margin-bottom: 16px; }
        .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #eee; }
        .total { font-weight: bold; border-top: 2px solid #000; margin-top: 8px; padding-top: 8px; }
        .section { margin-top: 16px; }
      </style></head><body>
      <h1>Z-REPORT</h1>
      <h2>${report.date}</h2>
      <div class="section">
        <div class="row"><span>Total Orders</span><span>${report.totalOrders}</span></div>
        <div class="row"><span>Cancelled</span><span>${report.totalCancelled}</span></div>
        <div class="row"><span>Refunded</span><span>${report.totalRefunded}</span></div>
      </div>
      <div class="section">
        <div class="row"><span>Gross Sales</span><span>Nu. ${report.grossSales.toFixed(2)}</span></div>
        <div class="row"><span>Subtotal</span><span>Nu. ${report.subtotal.toFixed(2)}</span></div>
        <div class="row"><span>GST</span><span>Nu. ${report.gstTotal.toFixed(2)}</span></div>
        <div class="row"><span>Refund Total</span><span>-Nu. ${report.refundTotal.toFixed(2)}</span></div>
        <div class="row total"><span>NET SALES</span><span>Nu. ${(report.grossSales - report.refundTotal).toFixed(2)}</span></div>
      </div>
      <div class="section">
        <div class="row"><span>Cash Sales</span><span>Nu. ${report.cashSales.toFixed(2)}</span></div>
        <div class="row"><span>Digital Sales</span><span>Nu. ${report.digitalSales.toFixed(2)}</span></div>
        <div class="row"><span>Credit Sales</span><span>Nu. ${report.creditSales.toFixed(2)}</span></div>
      </div>
      </body></html>
    `);
    w.document.close();
    w.print();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Z-Report
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground shrink-0" />
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="flex-1 h-10"
            />
          </div>

          {loading ? (
            <p className="text-muted-foreground text-center py-4">Loading...</p>
          ) : report ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-md bg-muted text-center">
                  <p className="text-muted-foreground text-xs">Orders</p>
                  <p className="text-lg font-bold">{report.totalOrders}</p>
                </div>
                <div className="p-2 rounded-md bg-muted text-center">
                  <p className="text-muted-foreground text-xs">Net Sales</p>
                  <p className="text-lg font-bold text-primary">
                    Nu. {(report.grossSales - report.refundTotal).toFixed(0)}
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gross Sales</span>
                  <span>{formatCurrency(report.grossSales)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(report.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">GST</span>
                  <span>{formatCurrency(report.gstTotal)}</span>
                </div>
                <div className="flex justify-between text-destructive">
                  <span>Refunds</span>
                  <span>{formatCurrency(report.refundTotal)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold">
                  <span>Net Sales</span>
                  <span>{formatCurrency(report.grossSales - report.refundTotal)}</span>
                </div>
              </div>

              <div className="space-y-1 pt-2 border-t border-border">
                <p className="text-xs font-medium text-muted-foreground uppercase">Payment Breakdown</p>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cash</span>
                  <span>{formatCurrency(report.cashSales)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Digital</span>
                  <span>{formatCurrency(report.digitalSales)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Credit</span>
                  <span>{formatCurrency(report.creditSales)}</span>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 h-11" onClick={onClose}>
                  Close
                </Button>
                <Button className="flex-1 h-11" onClick={handlePrint}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">No data for this date</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
