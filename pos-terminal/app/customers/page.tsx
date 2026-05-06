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
import { toast } from "sonner";
import {
  ArrowLeft,
  Users,
  Search,
  UserPlus,
  IndianRupee,
  ArrowDownCircle,
} from "lucide-react";

export default function CustomersPage() {
  const { customers, loading, createCustomer, recordRepayment, refresh } = useCustomers();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showRepay, setShowRepay] = useState<string | null>(null);
  const [newCustomer, setNewCustomer] = useState({ debtor_name: "", debtor_phone: "" });
  const [repayAmount, setRepayAmount] = useState(0);
  const [repayMethod, setRepayMethod] = useState("cash");

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
      setNewCustomer({ debtor_name: "", debtor_phone: "" });
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
                    <TableCell className="text-right">
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
    </div>
  );
}
