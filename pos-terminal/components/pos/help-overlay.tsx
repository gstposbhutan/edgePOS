"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface HelpOverlayProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { key: "F1", action: "Help overlay" },
  { key: "F2", action: "New transaction" },
  { key: "F3", action: "Hold cart" },
  { key: "F4", action: "Recall held cart" },
  { key: "F5", action: "Payment / Checkout" },
  { key: "F6", action: "Print last receipt" },
  { key: "F7", action: "Void last item" },
  { key: "F9", action: "Focus search" },
  { key: "F10", action: "Discount entry" },
  { key: "F11", action: "Fullscreen toggle" },
  { key: "Esc", action: "Cancel / Go back" },
  { key: "Tab", action: "Toggle cart panel" },
  { key: "Del", action: "Remove last cart item" },
  { key: "Ctrl+Z", action: "Undo last action" },
  { key: "Ctrl+C", action: "Compact layout" },
  { key: "Ctrl+S", action: "Standard layout" },
  { key: "↑ ↓", action: "Navigate products" },
  { key: "Enter", action: "Add highlighted product" },
  { key: "A-Z/0-9", action: "Type to search" },
];

export function HelpOverlay({ open, onClose }: HelpOverlayProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 text-sm">
          {SHORTCUTS.map((s) => (
            <div key={s.key} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50">
              <kbd className="min-w-[4.5rem] text-center px-2 py-0.5 text-xs font-mono font-bold bg-muted border border-border rounded">
                {s.key}
              </kbd>
              <span className="text-muted-foreground">{s.action}</span>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground text-center mt-2">
          Press F1 or Escape to close
        </p>
      </DialogContent>
    </Dialog>
  );
}
