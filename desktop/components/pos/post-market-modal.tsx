"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Confirms flipping visible_on_web on the cart's products (propagates on sync). */
export function PostMarketModal({
  open,
  onClose,
  onConfirm,
  productNames,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  productNames: string[];
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Post to Market?</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <p>Mark {productNames.length} product(s) visible on the web marketplace:</p>
          <ul className="max-h-40 overflow-y-auto rounded-md border border-border divide-y divide-border">
            {productNames.map((n, i) => (
              <li key={i} className="px-2 py-1.5 text-xs">{n}</li>
            ))}
          </ul>
          <p className="text-muted-foreground">Propagates to the marketplace on the next cloud sync.</p>
        </div>
        <div className="flex gap-2 pt-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={() => { onConfirm(); onClose(); }}>
            Post
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
