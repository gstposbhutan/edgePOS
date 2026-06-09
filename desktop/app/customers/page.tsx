"use client";

import { useState } from "react";
import Link from "next/link";
import { useCustomers } from "@/hooks/use-customers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { KHATA_STATUS } from "@/lib/constants";
import { toast } from "sonner";
import {
  ArrowLeft,
  Users,
  Search,
  UserPlus,
  ArrowDownCircle,
  SlidersHorizontal,
  Snowflake,
  Sun,
} from "lucide-react";

export default function CustomersPage() {
  const { customers, loading, createCustomer, recordRepayment, adjustBalance, toggleFreeze, refresh } = useCustomers();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showRepay, setShowRepay] = useState<string | null>(null);
  const [showAdjust, setShowAdjust] = useState<string | null>(null);
  const [newCustomer, setNewCustomer] = useState({ debtor_name: "", debtor_phone: "", credit_limit: 0 });
  const [repayAmount, setRepayAmount] = useState(0);
  const [repayMethod, setRepayMethod] = useState("cash");
  const [adjustAmount, setAdjustAmount] = useState(0);
  const [adjustReason, setAdjustReason] = useState("");

  const filtered = customers.filter(
    (c) =>
      c.debtor_name.toLowerCase().includes(search.toLowerCase()) ||
      c.debtor_phone.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    if (!newCustomer.debtor_name.trim()) return;
    const result = await createCustomer(newCustomer);
    if (result.success) {
      toast.success("Customer created");
      setShowCreate(false);
      setNewCustomer({ debtor_name: "", debtor_phone: "", credit_limit: 0 });
      refresh();
    } else {
      toast.error(result.error);
    }
  };

  const handleRepay = async (customerId: string) => {
    if (repayAmount <= 0) return;
    const result = await recordRepayment(customerId, repayAmount, repayMethod);
    if (result.success) {
      toast.success("Repayment recorded");
      setShowRepay(null);
      setRepayAmount(0);
      refresh();
    } else {
      toast.error(result.error);
    }
  };

  const handleAdjust = async (customerId: string) => {
    if (adjustAmount === 0) {
      toast.error("Enter a non-zero amount");
      return;
    }
    const result = await adjustBalance(customerId, adjustAmount, adjustReason.trim() || "Manual adjustment");
    if (result.success) {
      toast.success("Balance adjusted");
      setShowAdjust(null);
      setAdjustAmount(0);
      setAdjustReason("");
      refresh();
    } else {
      toast.error(result.error);
    }
  };

  const handleToggleFreeze = async (customerId: string) => {
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) return;
    const result = await toggleFreeze(customer);
    if (result.success) {
      toast.success(customer.status === KHATA_STATUS.FROZEN ? "Account unfrozen" : "Account frozen");
      refresh();
    } else {
      toast.error(result.error);
    }
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
          <h1 className="font-serif font-bold text-lg">Customers</h1>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <UserPlus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </header>

      <main className="p-4 max-w-5xl mx-auto space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
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
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Credit Limit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell className="font-medium">{customer.debtor_name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{customer.debtor_phone}</TableCell>
                    <TableCell className="text-right">
                      {customer.credit_limit > 0 ? `Nu. ${customer.credit_limit.toFixed(0)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {customer.outstanding_balance > 0 ? (
                        <Badge variant="destructive" className="text-xs">
                          Nu. {customer.outstanding_balance.toFixed(2)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {customer.status === KHATA_STATUS.FROZEN ? (
                        <Badge variant="outline" className="text-xs border-blue-400/50 text-blue-400">Frozen</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        {customer.outstanding_balance > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setShowRepay(customer.id);
                              setRepayAmount(Math.min(customer.outstanding_balance, 1000));
                            }}
                          >
                            <ArrowDownCircle className="h-4 w-4 mr-1" />
                            Repay
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setShowAdjust(customer.id);
                            setAdjustAmount(0);
                            setAdjustReason("");
                          }}
                        >
                          <SlidersHorizontal className="h-4 w-4 mr-1" />
                          Adjust
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title={customer.status === KHATA_STATUS.FROZEN ? "Unfreeze account" : "Freeze account"}
                          onClick={() => handleToggleFreeze(customer.id)}
                        >
                          {customer.status === KHATA_STATUS.FROZEN ? <Sun className="h-4 w-4" /> : <Snowflake className="h-4 w-4" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </main>

      {/* Create Customer Modal */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={newCustomer.debtor_name}
                onChange={(e) => setNewCustomer({ ...newCustomer, debtor_name: e.target.value })}
                placeholder="Customer name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Phone</label>
              <Input
                value={newCustomer.debtor_phone}
                onChange={(e) => setNewCustomer({ ...newCustomer, debtor_phone: e.target.value })}
                placeholder="+975-12345678"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Credit Limit (Nu.)</label>
              <Input
                type="number"
                min={0}
                value={newCustomer.credit_limit || ""}
                onChange={(e) => setNewCustomer({ ...newCustomer, credit_limit: parseFloat(e.target.value) || 0 })}
                placeholder="0 = no limit"
              />
              <p className="text-xs text-muted-foreground">
                Credit sales are blocked once the outstanding balance would exceed this. Leave 0 for no limit.
              </p>
            </div>
            <Button className="w-full" onClick={handleCreate} disabled={!newCustomer.debtor_name.trim()}>
              Create Customer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Repay Modal */}
      <Dialog open={!!showRepay} onOpenChange={() => setShowRepay(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Repayment</DialogTitle>
          </DialogHeader>
          {showRepay && (
            <div className="space-y-3">
              {(() => {
                const customer = customers.find((c) => c.id === showRepay);
                if (!customer) return null;
                return (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Customer: <span className="font-medium text-foreground">{customer.debtor_name}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Outstanding: <span className="font-medium text-destructive">Nu. {customer.outstanding_balance.toFixed(2)}</span>
                    </p>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Amount</label>
                      <Input
                        type="number"
                        min={1}
                        max={customer.outstanding_balance}
                        value={repayAmount}
                        onChange={(e) => setRepayAmount(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Method</label>
                      <select
                        value={repayMethod}
                        onChange={(e) => setRepayMethod(e.target.value)}
                        className="w-full h-10 rounded-md border border-border bg-background px-3"
                      >
                        <option value="cash">Cash</option>
                        <option value="mbob">mBoB</option>
                        <option value="mpay">mPay</option>
                        <option value="rtgs">RTGS</option>
                      </select>
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => handleRepay(showRepay)}
                      disabled={repayAmount <= 0 || repayAmount > customer.outstanding_balance}
                    >
                      Record Repayment
                    </Button>
                  </>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Adjust Balance Modal */}
      <Dialog open={!!showAdjust} onOpenChange={() => setShowAdjust(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust Balance</DialogTitle>
          </DialogHeader>
          {showAdjust && (() => {
            const customer = customers.find((c) => c.id === showAdjust);
            if (!customer) return null;
            const projected = Math.max(0, customer.outstanding_balance + adjustAmount);
            return (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Customer: <span className="font-medium text-foreground">{customer.debtor_name}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Current balance: <span className="font-medium text-foreground">Nu. {customer.outstanding_balance.toFixed(2)}</span>
                </p>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Amount (+ owes more, − owes less)</label>
                  <Input
                    type="number"
                    step={0.01}
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(parseFloat(e.target.value) || 0)}
                    placeholder="e.g. -500 to write off"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Reason</label>
                  <Input
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    placeholder="Opening balance, write-off, dispute..."
                  />
                </div>
                <p className="text-sm text-center text-muted-foreground">
                  New balance: <span className="font-semibold text-foreground tabular-nums">Nu. {projected.toFixed(2)}</span>
                </p>
                <Button className="w-full" onClick={() => handleAdjust(showAdjust)} disabled={adjustAmount === 0}>
                  Apply Adjustment
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
