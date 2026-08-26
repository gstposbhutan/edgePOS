"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { useRequireRole } from "@/hooks/use-require-role";
import { useShifts } from "@/hooks/use-shifts";
import { useCashAdjustments } from "@/hooks/use-cash-adjustments";
import { usePlatform } from "@/hooks/use-platform";
import { useSettings } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OfficeShell } from "@/components/office/office-shell";
import { OfficeGrid } from "@/components/office/office-grid";
import { REPORT_KEYS, withHandlers } from "@/lib/office-keys";
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
  Unlock,
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
  const { user } = useAuth();
  useRequireRole(["owner", "manager"] as const);
  const { api } = usePlatform();
  const { settings } = useSettings();
  const handleOpenDrawer = async () => {
    if (!api) return;
    const r = await api.printer.openDrawer(settings || {});
    if (r.success) toast.success("Drawer opened");
    else toast.error(r.error || "Could not open drawer");
  };
  const { activeShift } = useShifts();
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

  // The terminal's cash book (spec WF-09) — the drawer's own ledger, with the balance carried
  // down. The mirror of the cloud app's Cash Book, so the two read the same; the difference is
  // that this one covers the shift in front of the cashier rather than a period.
  //
  // Direction lives in the TYPE, not the sign — CASH_OUT is stored positive — so the running
  // balance has to apply it rather than summing the column.
  let running = 0;
  const ledgerRows = adjustments.map((adj) => {
    const amount = Number(adj.amount ?? 0);
    const isIn = adj.type === "CASH_IN";
    running += isIn ? amount : -amount;
    return {
      id: adj.id,
      when: formatDateTime(adj.created_at),
      particulars: isIn ? "Cash in" : "Cash out",
      reason: adj.reason || "",
      notes: adj.notes || "",
      in_amt: isIn ? amount.toFixed(2) : "",
      out_amt: isIn ? "" : amount.toFixed(2),
      balance: running.toFixed(2),
    };
  });

  const LEDGER_COLUMNS = [
    { key: "when",        label: "Time",        width: 150 },
    { key: "particulars", label: "Particulars", width: 110 },
    { key: "reason",      label: "Reason" },
    { key: "notes",       label: "Notes",       width: 200 },
    { key: "in_amt",      label: "Cash In",     width: 110, align: "right" as const },
    { key: "out_amt",     label: "Cash Out",    width: 110, align: "right" as const },
    { key: "balance",     label: "Balance",     width: 120, align: "right" as const },
  ];

  return (
    <OfficeShell
      crumb="Financial Management"
      title="Cash Book"
      keys={[
        { key: "N", label: "Add Adjustment", onClick: () => setShowAdd(true) },
        { key: "O", label: "Open Drawer", onClick: handleOpenDrawer },
        ...withHandlers(REPORT_KEYS, {}),
      ]}
    >
      <div className="flex flex-wrap items-center gap-3 mb-3 text-[12px]">
        <span className="opacity-75">
          in {formatCurrency(totalCashIn)} · out {formatCurrency(totalCashOut)} · {adjustments.length} movement{adjustments.length === 1 ? "" : "s"}
        </span>
        {!activeShift && <span className="ml-auto opacity-75">No open shift — adjustments need one.</span>}
      </div>

      <OfficeGrid
        columns={LEDGER_COLUMNS}
        rows={ledgerRows}
        totals={{ when: "Closing", in_amt: totalCashIn.toFixed(2), out_amt: totalCashOut.toFixed(2), balance: running.toFixed(2) }}
        empty="No adjustments recorded. Cash movements will appear here."
      />

      <p className="mt-2 text-[10px] opacity-60">
        Cash only, and only this shift&apos;s movements. Amounts in Nu.
      </p>

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
    </OfficeShell>
  );
}
