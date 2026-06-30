"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserPlus, Search, User, Snowflake, AlertTriangle } from "lucide-react";
import type { Customer } from "@/hooks/use-customers";

const TYPE_LABELS: Record<string, string> = {
  CONSUMER: "Consumer",
  RETAILER: "Retailer",
  WHOLESALER: "Wholesaler",
  SUPPLIER: "Supplier",
};
const typeLabel = (t?: string) => (t && TYPE_LABELS[t]) || t || "—";

interface CustomerModalProps {
  open: boolean;
  onClose: () => void;
  customers: Customer[];
  selectedCustomer: Customer | null;
  onSelect: (customer: Customer | null) => void;
  onCreate: (data: { debtor_name: string; debtor_phone: string }) => void;
}

export function CustomerModal({
  open,
  onClose,
  customers,
  selectedCustomer,
  onSelect,
  onCreate,
}: CustomerModalProps) {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const filtered = customers.filter(
    (c) =>
      c.debtor_name.toLowerCase().includes(search.toLowerCase()) ||
      c.debtor_phone.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = () => {
    if (!newName.trim()) return;
    onCreate({ debtor_name: newName.trim(), debtor_phone: newPhone.trim() });
    setShowCreate(false);
    setNewName("");
    setNewPhone("");
  };

  const pick = (c: Customer | null) => {
    onSelect(c);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Select Customer</DialogTitle>
        </DialogHeader>

        {!showCreate ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search customers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-11 text-base"
                autoFocus
              />
            </div>

            {/* Walk-in (cash sale, no khata account) */}
            <button
              onClick={() => pick(null)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                selectedCustomer === null
                  ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                  : "border-border hover:border-primary/50 hover:bg-accent/50"
              }`}
            >
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="font-medium">Walk-in Customer</p>
                <p className="text-xs text-muted-foreground">Cash sale — no khata account</p>
              </div>
            </button>

            <div className="max-h-80 overflow-y-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">Mobile</th>
                    <th className="text-left font-medium px-3 py-2">Name</th>
                    <th className="text-left font-medium px-3 py-2">Type</th>
                    <th className="text-right font-medium px-3 py-2">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const frozen = c.status === "FROZEN";
                    const overLimit = c.credit_limit > 0 && c.outstanding_balance >= c.credit_limit;
                    return (
                      <tr
                        key={c.id}
                        onClick={() => !frozen && pick(c)}
                        className={`border-t border-border transition-colors ${
                          frozen
                            ? "opacity-50 cursor-not-allowed"
                            : overLimit
                            ? "bg-orange-500/10 hover:bg-orange-500/20 cursor-pointer"
                            : selectedCustomer?.id === c.id
                            ? "bg-primary/10 cursor-pointer"
                            : "hover:bg-accent/50 cursor-pointer"
                        }`}
                        title={
                          frozen
                            ? "Account frozen — credit sale blocked"
                            : overLimit
                            ? "Over credit limit — please note"
                            : undefined
                        }
                      >
                        <td className="px-3 py-2.5 tabular-nums">{c.debtor_phone || "—"}</td>
                        <td className="px-3 py-2.5 font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            {c.debtor_name}
                            {frozen && <Snowflake className="h-3.5 w-3.5 text-sky-500" />}
                            {overLimit && !frozen && (
                              <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{typeLabel(c.party_type)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {c.outstanding_balance > 0
                            ? `Nu. ${c.outstanding_balance.toFixed(2)}`
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                        No customers found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <Button variant="outline" className="w-full h-11" onClick={() => setShowCreate(true)}>
              <UserPlus className="h-5 w-5 mr-2" />
              Add New Customer
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">Name *</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Customer name"
                className="h-11 text-base"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Phone</Label>
              <Input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="+975-12345678"
                className="h-11 text-base"
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 h-11" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button className="flex-1 h-11" onClick={handleCreate} disabled={!newName.trim()}>
                Create Customer
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
