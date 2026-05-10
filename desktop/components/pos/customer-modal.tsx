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
  DialogFooter,
} from "@/components/ui/dialog";
import { UserPlus, Search, User } from "lucide-react";
import type { Customer } from "@/hooks/use-customers";

interface CustomerModalProps {
  open: boolean;
  onClose: () => void;
  customers: Customer[];
  selectedCustomer: Customer | null;
  onSelect: (customer: Customer) => void;
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

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
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

            <div className="max-h-72 overflow-y-auto space-y-1">
              {filtered.map((customer) => (
                <button
                  key={customer.id}
                  onClick={() => {
                    onSelect(customer);
                    onClose();
                  }}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all ${
                    selectedCustomer?.id === customer.id
                      ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                      : "border-border hover:border-primary/50 hover:bg-accent/50"
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <User className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-base">{customer.debtor_name}</p>
                    {customer.debtor_phone && (
                      <p className="text-sm text-muted-foreground">{customer.debtor_phone}</p>
                    )}
                  </div>
                  {customer.credit_limit > 0 && (
                    <div className="text-sm text-right shrink-0">
                      <p className="text-muted-foreground text-xs">Limit</p>
                      <p className="font-semibold tabular-nums">Nu. {customer.credit_limit.toFixed(0)}</p>
                    </div>
                  )}
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="text-base text-muted-foreground text-center py-6">
                  No customers found
                </p>
              )}
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
