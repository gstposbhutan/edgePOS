"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { getPB } from "@/lib/pb-client";

export interface TeamUser {
  id: string;
  name?: string;
  email?: string;
  role?: string;
}

/** Picks a team member (local `users`) to attribute the next sale to. */
export function SalespersonPickerModal({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (u: TeamUser) => void;
}) {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) return;
    getPB()
      .collection("users")
      .getFullList<TeamUser>({ sort: "name", requestKey: null })
      .then(setUsers)
      .catch(() => setUsers([]));
  }, [open]);

  const filtered = users.filter(
    (u) => !q || `${u.name || ""} ${u.email || ""}`.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Select Salesperson</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search team…" className="pl-8" autoFocus />
        </div>
        <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
          {filtered.map((u) => (
            <button
              key={u.id}
              onClick={() => { onSelect(u); onClose(); }}
              className="w-full text-left px-3 py-2.5 border-b border-border last:border-0 hover:bg-accent/50 flex items-center justify-between"
            >
              <span className="font-medium text-sm">{u.name || u.email || "Unknown"}</span>
              {u.role && <span className="text-[10px] uppercase text-muted-foreground">{u.role}</span>}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No team members</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
