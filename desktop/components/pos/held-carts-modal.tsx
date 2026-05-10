"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Archive, Clock, ShoppingCart, X } from "lucide-react";
import type { HeldCart } from "@/hooks/use-held-carts";

interface HeldCartsModalProps {
  open: boolean;
  onClose: () => void;
  heldCarts: HeldCart[];
  onRecall: (cartId: string) => void;
  onDiscard: (cartId: string) => void;
}

export function HeldCartsModal({ open, onClose, heldCarts, onRecall, onDiscard }: HeldCartsModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5" />
            Held Carts
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {heldCarts.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <ShoppingCart className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No held carts</p>
              <p className="text-xs mt-1">Press F3 to hold current cart</p>
            </div>
          ) : (
            heldCarts.map((cart) => (
              <div
                key={cart.id}
                className="flex items-center gap-3 p-4 rounded-xl border border-border hover:border-primary/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-base font-medium truncate">{cart.label}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{new Date(cart.heldAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                    <span>·</span>
                    <span>{cart.itemCount} items</span>
                  </div>
                </div>
                <p className="text-base font-semibold text-primary shrink-0">Nu. {cart.total.toFixed(0)}</p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => onDiscard(cart.id)}
                >
                  <X className="h-5 w-5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 px-4 shrink-0"
                  onClick={() => onRecall(cart.id)}
                >
                  Recall
                </Button>
              </div>
            ))
          )}
        </div>

        <Button variant="outline" className="w-full h-11" onClick={onClose}>
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
}
