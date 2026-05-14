"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { useShifts } from "@/hooks/use-shifts";
import { useCashAdjustments } from "@/hooks/use-cash-adjustments";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
  Plus,
  Minus,
  ArrowDownToLine,
  ArrowUpToLine,
  Wallet,
  TrendingUp,
  TrendingDown,
  Scale,
  Clock,
} from "lucide-react";
import { CASH_ADJUSTMENT_REASON, CASH_ADJUSTMENT_TYPE } from "@/lib/constants";
import { formatCurrency } from "@/lib/gst";
import { formatDateTime } from "@/lib/date-utils";
import { toast } from "sonner";

export default function AdjustmentsPage() {
  const { user, isManager, loading: authLoading } = useAuth();
  const { activeShift } = useShifts();

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>;
  if (!isManager) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <Wallet className="h-12 w-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Access restricted to managers and owners</p>
          <Link href="/"><Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Back to POS</Button></Link>
        </div>
      </div>
    );
  }
  const {
    adjustments,
    loading,
    addAdjustment,
    totalCashIn,
    totalCashOut,
    netAdjustment,
  } = useCashAdjustments(activeShift?.id);

  const [showAdd, setShowAdd] = useState(false);
  const [adjType, setAdjType] = useState<"CASH_IN" | "CASH_OUT">("CASH_IN");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<string>(CASH_ADJUSTMENT_REASON.PETTY_CASH);
  const [notes, setNotes] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!user) return null;

  const handleAdd = async () => {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!activeShift) {
      toast.error("No active shift. Open a shift first.");
      return;
    }
    setSubmitting(true);
    const finalReason = reason === CASH_ADJUSTMENT_REASON.OTHER ? customReason : reason;
    const result = await addAdjustment({
      amount: parsed,
      type: adjType,
      reason: finalReason || CASH_ADJUSTMENT_REASON.OTHER,
      notes: notes || undefined,
      shift: activeShift.id,
      created_by: user.id,
    });
    if (result.success) {
      toast.success(`${adjType === "CASH_IN" ? "Cash In" : "Cash Out"} recorded`);
      setAmount("");
      setNotes("");
      setCustomReason("");
      setShowAdd(false);
    } else {
      toast.error(result.error || "Failed");
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon-sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-heading font-bold">Cash Adjustments</h1>
            <p className="text-xs text-muted-foreground">Shift cash movement ledger</p>
          </div>
        </div>
        <Button onClick={() => setShowAdd(true)} disabled={!activeShift}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add Adjustment
        </Button>
      </header>

      {/* Summary Cards */}
      <div className="px-4 py-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Cash In</p>
          <div className="flex items-center gap-1.5">
            <ArrowDownToLine className="h-4 w-4 text-emerald-500" />
            <span className="text-lg font-bold text-emerald-500 tabular-nums">
              {formatCurrency(totalCashIn)}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Cash Out</p>
          <div className="flex items-center gap-1.5">
            <ArrowUpToLine className="h-4 w-4 text-destructive" />
            <span className="text-lg font-bold text-destructive tabular-nums">
              {formatCurrency(totalCashOut)}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Net Adjustment</p>
          <div className="flex items-center gap-1.5">
            <Scale className="h-4 w-4 text-primary" />
            <span className={`text-lg font-bold tabular-nums ${netAdjustment >= 0 ? "text-emerald-500" : "text-destructive"}`}>
              {formatCurrency(netAdjustment)}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Entries</p>
          <div className="flex items-center gap-1.5">
            <Wallet className="h-4 w-4 text-primary" />
            <span className="text-lg font-bold tabular-nums">{adjustments.length}</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="px-4 pb-8">
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Time</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adjustments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                    <Clock className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">No adjustments recorded</p>
                    <p className="text-xs mt-1">Cash movements will appear here</p>
                  </TableCell>
                </TableRow>
              ) : (
                adjustments.map((adj) => (
                  <TableRow key={adj.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(adj.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={adj.type === "CASH_IN" ? "default" : "destructive"} className="text-[10px]">
                        {adj.type === "CASH_IN" ? (
                          <><ArrowDownToLine className="h-3 w-3 mr-0.5" /> In</>
                        ) : (
                          <><ArrowUpToLine className="h-3 w-3 mr-0.5" /> Out</>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{adj.reason}</TableCell>
                    <TableCell className={`text-right font-medium tabular-nums ${adj.type === "CASH_IN" ? "text-emerald-500" : "text-destructive"}`}>
                      {adj.type === "CASH_IN" ? "+" : "-"}{formatCurrency(adj.amount)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {adj.notes || "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Add Adjustment Dialog */}
      <Dialog open={showAdd} onOpenChange={(v) => { if (!v) setShowAdd(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Record Cash Adjustment
            </DialogTitle>
            <DialogDescription>
              Record cash added to or removed from the drawer during this shift.
              This affects the expected total when closing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Type Toggle */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={adjType === "CASH_IN" ? "default" : "outline"}
                onClick={() => setAdjType("CASH_IN")}
                className={adjType === "CASH_IN" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20" : ""}
              >
                <ArrowDownToLine className="h-4 w-4 mr-1.5" />
                Cash In
              </Button>
              <Button
                variant={adjType === "CASH_OUT" ? "default" : "outline"}
                onClick={() => setAdjType("CASH_OUT")}
                className={adjType === "CASH_OUT" ? "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20" : ""}
              >
                <ArrowUpToLine className="h-4 w-4 mr-1.5" />
                Cash Out
              </Button>
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <Label className="text-xs">Amount (Nu.)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-12 text-lg text-center"
                autoFocus
              />
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <Label className="text-xs">Reason</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.values(CASH_ADJUSTMENT_REASON).map((r) => (
                  <Button
                    key={r}
                    variant={reason === r ? "default" : "outline"}
                    size="sm"
                    onClick={() => setReason(r)}
                    className="text-xs justify-start"
                  >
                    {r}
                  </Button>
                ))}
              </div>
            </div>

            {/* Custom Reason */}
            {reason === CASH_ADJUSTMENT_REASON.OTHER && (
              <div className="space-y-1.5">
                <Label className="text-xs">Specify reason</Label>
                <Input
                  placeholder="e.g., Stationery purchase"
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                />
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs">Notes (optional)</Label>
              <Input
                placeholder="Additional details..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowAdd(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleAdd}
                disabled={submitting || !amount || (!customReason && reason === CASH_ADJUSTMENT_REASON.OTHER)}
              >
                {submitting ? "Recording..." : `Record ${adjType === "CASH_IN" ? "Cash In" : "Cash Out"}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
