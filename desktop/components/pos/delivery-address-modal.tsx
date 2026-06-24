"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/** Captures a free-text delivery address attached to the next confirmed sale. */
export function DeliveryAddressModal({
  open,
  onClose,
  initial,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  initial: string;
  onApply: (addr: string) => void;
}) {
  const [addr, setAddr] = useState(initial);
  useEffect(() => {
    if (open) setAddr(initial);
  }, [initial, open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delivery Address</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-sm">Address for the next sale</Label>
          <textarea
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            rows={4}
            placeholder="House no, street, locality, landmark…"
            className="w-full rounded-md border border-border bg-background p-2 text-sm"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">Attached to the next confirmed sale, then cleared.</p>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={() => { onApply(""); onClose(); }}>
            Clear
          </Button>
          <Button className="flex-1" onClick={() => { onApply(addr.trim()); onClose(); }}>
            Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
