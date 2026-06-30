"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Search, DoorClosed, AlertTriangle, ArrowLeftRight } from "lucide-react";
import { getPB } from "@/lib/pb-client";
import type { TeamUser } from "@/components/pos/salesperson-picker-modal";

/**
 * Shown when a cashier signs out while a shift is open. Three actions:
 *  - Close shift & sign out → runs the existing close/reconcile flow (onCloseShift).
 *  - Hand over to another cashier → pick a team member + password; on a correct
 *    password the logged-in cashier swaps (switchUser) while the shift stays open.
 *    A wrong password keeps the current cashier (authWithPassword is atomic).
 *  - Cancel → stay logged in.
 * No cash count happens at handover (drawer continuity; opened_by unchanged).
 */
export function HandoverModal({
  open,
  onClose,
  onCloseShift,
  switchUser,
  currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  onCloseShift: () => void;
  switchUser: (email: string, password: string) => Promise<{ success: boolean; error: string | null }>;
  currentUserId?: string;
}) {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<TeamUser | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setSelected(null);
    setPassword("");
    setError("");
    setSubmitting(false);
    getPB()
      .collection("users")
      .getFullList<TeamUser>({ sort: "name", requestKey: null })
      // Drop the current cashier — handing over to yourself is a no-op.
      .then((list) => setUsers(list.filter((u) => u.id !== currentUserId)))
      .catch(() => setUsers([]));
  }, [open, currentUserId]);

  const filtered = users.filter(
    (u) => !q || `${u.name || ""} ${u.email || ""}`.toLowerCase().includes(q.toLowerCase())
  );

  const handleHandover = async () => {
    if (!selected) return;
    if (!selected.email) {
      setError("This cashier has no email on file and cannot sign in");
      return;
    }
    if (!password) {
      setError("Enter the cashier's password");
      return;
    }
    setError("");
    setSubmitting(true);
    // Capture the outgoing cashier BEFORE the switch — authWithPassword replaces the
    // token, so the audit endpoint can't read the previous cashier from it afterwards.
    const from = getPB().authStore.record;
    const fromId = from?.id || "";
    const fromName = (from?.name as string) || "";
    const result = await switchUser(selected.email, password);
    if (result.success) {
      // Best-effort handover audit (append-only collection, written server-side).
      try {
        await getPB().send("/api/custom/handover-audit", {
          method: "POST",
          body: {
            from_user_id: fromId,
            from_user_name: fromName,
            to_user_id: selected.id,
            to_user_name: selected.name || selected.email || "",
          },
        });
      } catch {
        /* audit is best-effort — never block the handover */
      }
      setSubmitting(false);
      onClose();
    } else {
      // Wrong password — current cashier stays logged in.
      setError(result.error || "Incorrect password");
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5" /> Sign Out
          </DialogTitle>
          <DialogDescription>
            A shift is still open. Close it, or hand the till over to another cashier.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Close shift & sign out */}
          <Button
            variant="outline"
            className="w-full h-11 justify-start border-warning/30 text-warning hover:bg-warning/10"
            onClick={onCloseShift}
            disabled={submitting}
          >
            <DoorClosed className="h-4 w-4 mr-2" />
            Close shift &amp; sign out
          </Button>

          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">or hand over</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Hand over to another cashier — keeps the shift open */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search team…" className="pl-8" />
            </div>
            <div className="max-h-44 overflow-y-auto rounded-lg border border-border">
              {filtered.map((u) => (
                <button
                  key={u.id}
                  onClick={() => { setSelected(u); setError(""); }}
                  className={`w-full text-left px-3 py-2.5 border-b border-border last:border-0 hover:bg-accent/50 flex items-center justify-between ${
                    selected?.id === u.id ? "bg-accent" : ""
                  }`}
                >
                  <span className="font-medium text-sm">{u.name || u.email || "Unknown"}</span>
                  {u.role && <span className="text-[10px] uppercase text-muted-foreground">{u.role}</span>}
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">No other team members</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="handover-password" className="text-sm">
                {selected ? `${selected.name || selected.email}'s password` : "Cashier password"}
              </Label>
              <Input
                id="handover-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleHandover(); }}
                placeholder="••••••••"
                disabled={!selected || submitting}
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1 h-11" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button className="flex-1 h-11" onClick={handleHandover} disabled={!selected || !password || submitting}>
              {submitting ? "Handing over…" : "Hand over"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
