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
import { UserPlus, Search, User } from "lucide-react";
import type { Customer } from "@/hooks/use-customers";

interface CustomerModalProps {
  open: boolean;
  onClose: () => void;
  customers: Customer[];
  selectedCustomer: Customer | null;
  onSelect: (customer: Customer) => void;
  onCreate: (data: { name: string; phone: string }) => void;
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
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = () => {
    if (!newName.trim()) return;
    onCreate({ name: newName.trim(), phone: newPhone.trim() });
    setShowCreate(false);
    setNewName("");
    setNewPhone("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Select Customer</DialogTitle>
        </DialogHeader>

        {!showCreate ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search customers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="max-h-64 overflow-y-auto space-y-1">
              {filtered.map((customer) => (
                <button
                  key={customer.id}
                  onClick={() => {
                    onSelect(customer);
                    onClose();
                  }}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                    selectedCustomer?.id === customer.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <User className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{customer.name}</p>
                    {customer.phone && (
                      <p className="text-xs text-muted-foreground">{customer.phone}</p>
                    )}
                  </div>
                  {customer.credit_limit > 0 && (
                    <div className="text-xs text-right">
                      <p className="text-muted-foreground">Limit</p>
                      <p className="font-medium">Nu. {customer.credit_limit.toFixed(0)}</p>
                    </div>
                  )}
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No customers found
                </p>
              )}
            </div>

            <Button variant="outline" className="w-full" onClick={() => setShowCreate(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Add New Customer
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Customer name" />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+975-12345678" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>
                Back
              </Button>
              <Button className="flex-1" onClick={handleCreate} disabled={!newName.trim()}>
                Create
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
