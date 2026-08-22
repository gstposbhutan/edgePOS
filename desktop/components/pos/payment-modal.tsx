"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Banknote,
  Smartphone,
  CreditCard,
  Landmark,
  AlertTriangle,
  Coins,
  Camera,
} from "lucide-react";
import type { Customer } from "@/hooks/use-customers";
import { PAYMENT_METHOD, PAYMENT_CHANNEL, type PaymentMethod, type PaymentChannel } from "@/lib/constants";
import { TillBar } from "@/components/pos/keyboard/till-bar";
import { ReceiptScanModal, type ScanMeta } from "@/components/pos/receipt-scan-modal";
import { PaymentQr } from "@/components/pos/payment-qr";

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  grandTotal: number;
  customer: Customer | null;
  onConfirm: (
    method: PaymentMethod,
    channel: PaymentChannel | null,
    ref: string,
    tendered?: number,
    payments?: PaymentPart[],
  ) => void;
}

/** One means of settling part of a bill. */
export interface PaymentPart {
  method: PaymentMethod;
  channel: PaymentChannel | null;
  ref: string;
  amount: number;
}

// UI options carry their canonical (method, channel). mBoB/mPay/RTGS → ONLINE
// with a channel; cash/credit have no channel.
const METHODS: { id: string; label: string; icon: React.ReactNode; method: PaymentMethod; channel: PaymentChannel | null }[] = [
  { id: "cash",   label: "Cash",           icon: <Banknote className="h-5 w-5" />,   method: PAYMENT_METHOD.CASH,   channel: null },
  { id: "mbob",   label: "mBoB",           icon: <Smartphone className="h-5 w-5" />, method: PAYMENT_METHOD.ONLINE, channel: PAYMENT_CHANNEL.MBOB },
  { id: "mpay",   label: "mPay",           icon: <Smartphone className="h-5 w-5" />, method: PAYMENT_METHOD.ONLINE, channel: PAYMENT_CHANNEL.MPAY },
  { id: "rtgs",   label: "RTGS",           icon: <Landmark className="h-5 w-5" />,   method: PAYMENT_METHOD.ONLINE, channel: PAYMENT_CHANNEL.RTGS },
  { id: "credit", label: "Khata / Credit", icon: <CreditCard className="h-5 w-5" />, method: PAYMENT_METHOD.CREDIT, channel: null },
];

const DENOMINATIONS = [10, 50, 100, 500, 1000];

export function PaymentModal({ open, onClose, grandTotal, customer, onConfirm }: PaymentModalProps) {
  const [selectedId, setSelectedId] = useState("cash");
  const [reference, setReference] = useState("");
  const [tendered, setTendered] = useState<number>(grandTotal);
  const [error, setError] = useState("");
  const [receivedParts, setReceivedParts] = useState<number[]>([]);
  const [showScan, setShowScan] = useState(false);
  // Split tender (spec WF-07): parts already put down against this bill. Empty = a single
  // payment, which behaves exactly as before.
  const [parts, setParts] = useState<PaymentPart[]>([]);
  // The amount the next split part will take. An inline field, not window.prompt(): Electron
  // does not implement prompt() at all — it throws.
  const [partAmount, setPartAmount] = useState("");
  const [scanHint, setScanHint] = useState<ScanMeta | null>(null);

  const selected = METHODS.find((m) => m.id === selectedId) ?? METHODS[0];
  const method = selected.method;
  const channel = selected.channel;
  const isCash = method === PAYMENT_METHOD.CASH;
  const isCredit = method === PAYMENT_METHOD.CREDIT;
  const isOnline = method === PAYMENT_METHOD.ONLINE;

  useEffect(() => {
    if (open) {
      setTendered(grandTotal);
      setReceivedParts([]);
      setError("");
      setReference("");
      setShowScan(false);
      setScanHint(null);
      setParts([]);
      setPartAmount("");
    }
  }, [open, grandTotal]);

  const totalReceived = receivedParts.reduce((a, b) => a + b, 0);
  const effectiveTendered = isCash ? (receivedParts.length > 0 ? totalReceived : tendered) : 0;
  const change = isCash ? Math.max(0, effectiveTendered - grandTotal) : 0;

  const addDenomination = (denom: number) => {
    setReceivedParts((prev) => [...prev, denom]);
    setTendered(0);
  };

  const clearReceived = () => {
    setReceivedParts([]);
    setTendered(grandTotal);
  };

  const setExact = () => {
    setReceivedParts([]);
    setTendered(grandTotal);
  };

  const roundUp = () => {
    const rounded = Math.ceil(grandTotal / 5) * 5;
    setReceivedParts([]);
    setTendered(rounded);
  };

  const partsTotal = parseFloat(parts.reduce((sum, p) => sum + p.amount, 0).toFixed(2));
  const outstanding = parseFloat(Math.max(0, grandTotal - partsTotal).toFixed(2));

  // Put the currently selected method down for part of the bill and keep the sheet open for the
  // rest. Cash is capped at what is left: change is settled once, at the end, not per part.
  const addPart = () => {
    setError("");
    if (outstanding <= 0) return;
    // Blank means "the rest of the bill", which is what a cashier means on the last part.
    const raw = partAmount.trim() === "" ? outstanding.toFixed(2) : partAmount;
    const amount = parseFloat(parseFloat(raw || "0").toFixed(2));
    if (!(amount > 0)) { setError("Enter an amount greater than zero"); return; }
    if (amount > outstanding) { setError(`That is more than the Nu. ${outstanding.toFixed(2)} still due`); return; }
    if (isCredit && !customer) { setError("Customer is required for a credit part"); return; }
    setParts((prev) => [...prev, { method, channel, ref: reference, amount }]);
    setReference("");
    setPartAmount("");
  };

  const handleConfirm = () => {
    setError("");

    // A split is only tendered once every ngultrum is accounted for — a bill that is short is
    // an unpaid bill, however it was divided.
    if (parts.length > 0) {
      if (outstanding > 0) {
        setError(`Nu. ${outstanding.toFixed(2)} of this bill is still unpaid`);
        return;
      }
      // The primary is the largest part: payment_method is a single canonical value the cloud
      // CHECKs and reports group by, so it must stay CASH/CREDIT/ONLINE.
      const primary = [...parts].sort((a, b) => b.amount - a.amount)[0];
      const creditPart = parts.find((p) => p.method === PAYMENT_METHOD.CREDIT);
      if (creditPart && !customer) { setError("Customer is required for credit payment"); return; }
      onConfirm(primary.method, primary.channel, primary.ref, undefined, parts);
      return;
    }

    if (isCredit) {
      if (!customer) {
        setError("Customer is required for credit payment");
        return;
      }
      // Mirror checkout (P0-1): a credit_limit of <= 0 means "no limit configured".
      if (customer.credit_limit > 0 && customer.outstanding_balance + grandTotal > customer.credit_limit) {
        setError(
          `Credit limit exceeded. Outstanding: Nu. ${customer.outstanding_balance.toFixed(2)}, Limit: Nu. ${customer.credit_limit.toFixed(2)}`
        );
        return;
      }
    }

    const finalTendered = isCash ? effectiveTendered : 0;

    if (isCash && finalTendered < grandTotal) {
      setError("Tendered amount is less than total");
      return;
    }

    onConfirm(method, channel, reference, isCash ? finalTendered : undefined);
  };

  const remaining = isCash ? Math.max(0, grandTotal - effectiveTendered) : 0;

  // The tender sheet is keyboard-complete: before this, F10 opened it and the cashier then had
  // to reach for the mouse to finish the sale, which is exactly where a RanceLab counter is
  // fastest. Method keys take Alt so plain digits stay free for typing an amount.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");

      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      // F10 tenders from anywhere on the sheet — the same key that opened it. Enter does too,
      // except while typing a reference, where it would fire before the number is finished.
      if (e.key === "F10" || (e.key === "Enter" && !typing)) { e.preventDefault(); handleConfirm(); return; }

      if (e.altKey && (e.key === "a" || e.code === "KeyA")) { e.preventDefault(); addPart(); return; }
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        const m = METHODS[parseInt(e.key, 10) - 1];
        if (m) { e.preventDefault(); setSelectedId(m.id); }
        return;
      }
      if (!isCash || typing) return;
      if (e.ctrlKey && /^[1-9]$/.test(e.key)) {
        const denom = DENOMINATIONS[parseInt(e.key, 10) - 1];
        if (denom) { e.preventDefault(); addDenomination(denom); }
        return;
      }
      if (e.key.toLowerCase() === "e") { e.preventDefault(); setExact(); }
      else if (e.key.toLowerCase() === "r") { e.preventDefault(); roundUp(); }
    };
    // Capture, so the sheet's keys win over the counter's registry underneath it.
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="sr-only">
          <DialogTitle>Tender</DialogTitle>
        </DialogHeader>
        {/* Spec WF-07: the sheet states its own tax basis and the key that finishes the sale. */}
        <TillBar
          title="Tender"
          buyer={customer?.debtor_name}
          hint="Esc close"
        />

        <div className="space-y-4">
          {/* Total */}
          <div className="text-center p-4 rounded-lg bg-primary/10">
            <p className="text-sm text-muted-foreground">Amount Due</p>
            <p className="text-3xl font-bold text-primary tabular-nums">
              Nu. {grandTotal.toFixed(2)}
            </p>
          </div>

          {parts.length > 0 && (
            <div className="rounded-lg border border-border divide-y divide-border text-sm">
              {parts.map((p, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-1.5">
                  <span className="text-muted-foreground">
                    {METHODS.find((m) => m.method === p.method && m.channel === p.channel)?.label ?? p.method}
                    {p.ref ? ` · ${p.ref}` : ""}
                  </span>
                  <span className="flex items-center gap-3 tabular-nums">
                    Nu. {p.amount.toFixed(2)}
                    <button
                      type="button"
                      onClick={() => setParts((prev) => prev.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-destructive"
                      title="Remove this part"
                    >
                      ×
                    </button>
                  </span>
                </div>
              ))}
              <div className={`flex items-center justify-between px-3 py-1.5 font-medium ${outstanding > 0 ? "text-destructive" : "text-emerald-600"}`}>
                <span>{outstanding > 0 ? "Still due" : "Fully covered"}</span>
                <span className="tabular-nums">Nu. {outstanding.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Method selection */}
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map((m) => (
              <Button
                key={m.id}
                variant={selectedId === m.id ? "default" : "outline"}
                onClick={() => { setSelectedId(m.id); setError(""); }}
                className={`flex flex-col items-center gap-1 p-3 rounded-lg min-h-[4rem] h-auto ${
                  selectedId === m.id ? "" : "hover:border-primary/50"
                }`}
              >
                {m.icon}
                <span className="text-xs font-medium">{m.label}</span>
              </Button>
            ))}
          </div>

          {/* Cash: Denomination Tiles */}
          {isCash && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Quick Amounts
                </Label>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={setExact}>
                    Exact (E)
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={roundUp}>
                    Round (R)
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {DENOMINATIONS.map((denom) => (
                  <Button
                    key={denom}
                    variant="outline"
                    onClick={() => addDenomination(denom)}
                    className="flex flex-col items-center justify-center p-3 rounded-lg min-h-[4rem] h-auto active:scale-95"
                  >
                    <Coins className="h-4 w-4 text-primary mb-0.5" />
                    <span className="text-sm font-bold tabular-nums">Nu.{denom}</span>
                  </Button>
                ))}
              </div>

              {/* Received / Tendered summary */}
              {(receivedParts.length > 0 || tendered > 0) && (
                <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                  {receivedParts.length > 0 ? (
                    <>
                      <div className="flex flex-wrap gap-1 mb-1">
                        {receivedParts.map((part, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            Nu.{part}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Received</span>
                        <span className="font-medium tabular-nums">Nu. {totalReceived.toFixed(2)}</span>
                      </div>
                      <button
                        onClick={clearReceived}
                        className="text-xs text-primary hover:underline"
                      >
                        Clear & enter manually
                      </button>
                    </>
                  ) : (
                    <div className="space-y-1">
                      <Label className="text-xs">Tendered Amount</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={tendered || ""}
                        onChange={(e) => setTendered(parseFloat(e.target.value) || 0)}
                        className="h-12 text-lg"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Remaining / Change */}
              {remaining > 0 && (
                <p className="text-sm text-destructive font-medium text-center">
                  Remaining: Nu. {remaining.toFixed(2)}
                </p>
              )}
              {change > 0 && (
                <div className="text-center p-2 rounded-md bg-emerald-500/10">
                  <p className="text-sm text-emerald-400">Change Due</p>
                  <p className="text-xl font-bold text-emerald-400 tabular-nums">
                    Nu. {change.toFixed(2)}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Online: show the payment QR first (customer scans & pays), then capture the journal number */}
          {isOnline && <PaymentQr amount={grandTotal} />}

          {/* Reference for non-cash payments */}
          {!isCash && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Reference / Journal No</Label>
                {isOnline && (
                  <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setShowScan(true)}>
                    <Camera className="h-4 w-4 mr-1.5" /> Scan receipt
                  </Button>
                )}
              </div>
              <Input
                placeholder={
                  isCredit ? "Optional note" : "Enter transaction reference"
                }
                value={reference}
                onChange={(e) => { setReference(e.target.value); setScanHint(null); }}
                className="h-11"
              />
              {isOnline && scanHint && (
                <p className={`text-xs ${scanHint.amountMatches ? "text-emerald-500" : "text-amber-500"}`}>
                  {scanHint.amountMatches
                    ? `Scanned — Nu. ${scanHint.extractedAmount} matches the bill.`
                    : scanHint.extractedAmount != null
                      ? `Scanned — found Nu. ${scanHint.extractedAmount}, bill is Nu. ${grandTotal.toFixed(2)}. Please verify.`
                      : `Scanned — please verify the number.`}
                </p>
              )}
            </div>
          )}

          {/* Credit warning */}
          {isCredit && customer && (
            <div className="p-3 rounded-md bg-warning/10 border border-warning/20 text-sm">
              <div className="flex items-center gap-2 text-warning mb-1">
                <CreditCard className="h-4 w-4" />
                <span className="font-medium">Credit Account</span>
              </div>
              <p>Customer: {customer.debtor_name}</p>
              <p>
                Limit: {customer.credit_limit > 0 ? `Nu. ${customer.credit_limit.toFixed(2)}` : "No limit"} | Outstanding: Nu.{" "}
                {customer.outstanding_balance.toFixed(2)}
              </p>
              <p>
                After this: Nu. {(customer.outstanding_balance + grandTotal).toFixed(2)}
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Label htmlFor="split-amount" className="text-xs text-muted-foreground whitespace-nowrap">
              Split amount
            </Label>
            <Input
              id="split-amount"
              type="number"
              min="0"
              step="0.01"
              value={partAmount}
              placeholder={outstanding.toFixed(2)}
              onChange={(e) => setPartAmount(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); addPart(); } }}
              className="h-9 text-right tabular-nums"
            />
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 h-12" onClick={onClose}>
              Esc — Close
            </Button>
            <Button variant="outline" className="flex-1 h-12" onClick={addPart} disabled={outstanding <= 0 && parts.length > 0}>
              Alt+A — Split
            </Button>
            <Button className="flex-1 h-12 text-base" onClick={handleConfirm}>
              F10 — Tender
            </Button>
          </div>
          <p className="text-[11px] text-center text-muted-foreground">
            Alt+1–5 payment method · Alt+A split this bill{isCash ? " · Ctrl+1–5 add note · E exact · R round to Nu.5" : ""}
          </p>
        </div>

        <ReceiptScanModal
          open={showScan}
          expectedAmount={grandTotal}
          onClose={() => setShowScan(false)}
          onExtracted={(ref, meta) => { setReference(ref); setScanHint(meta); setShowScan(false); }}
        />
      </DialogContent>
    </Dialog>
  );
}
