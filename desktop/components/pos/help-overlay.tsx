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

const GROUPS: { title: string; stub?: boolean; shortcuts: { key: string; action: string }[] }[] = [
  {
    title: "Functional",
    shortcuts: [
      { key: "F1", action: "Help overlay" },
      { key: "F2", action: "New transaction" },
      { key: "F3", action: "Search / add item" },
      { key: "F4", action: "New cart (hold current)" },
      { key: "F5", action: "Recall held cart" },
      { key: "F6", action: "Customer select" },
      { key: "F7 / Alt+A", action: "Price list (Retail / Wholesale / Distributor)" },
      { key: "F9", action: "Change qty (line +/-)" },
      { key: "F10", action: "Tender / checkout" },
      { key: "Ctrl+A", action: "Add product (focus search)" },
      { key: "Ctrl+R", action: "Remove last item" },
      { key: "Ctrl+D", action: "Bill discount (all lines)" },
      { key: "Ctrl+Z", action: "Undo last action" },
      { key: "Del", action: "Remove last cart item" },
      { key: "Esc", action: "Cancel / go back" },
      { key: "↑ ↓", action: "Navigate products" },
      { key: "Enter", action: "Add highlighted product" },
      { key: "A-Z/0-9", action: "Type to search" },
    ],
  },
  {
    title: "Coming soon",
    stub: true,
    shortcuts: [
      { key: "F8", action: "Sales person (phase 4)" },
      { key: "Ctrl+C", action: "Complimentary (phase 4)" },
      { key: "Ctrl+E", action: "Exchange (phase 4)" },
      { key: "Alt+M", action: "Post to market (phase 4)" },
      { key: "Alt+Q", action: "Convert to quotation (phase 4)" },
      { key: "Alt+D", action: "Delivery address (phase 4)" },
    ],
  },
];

export function HelpOverlay({ open, onClose }: HelpOverlayProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className={`text-xs font-semibold uppercase tracking-wide mb-1 ${group.stub ? "text-muted-foreground/60" : "text-muted-foreground"}`}>
                {group.title}
              </h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {group.shortcuts.map((s) => (
                  <div key={s.key + s.action} className={`flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 ${group.stub ? "opacity-50" : ""}`}>
                    <kbd className="min-w-[4.5rem] text-center px-2 py-0.5 text-xs font-mono font-bold bg-muted border border-border rounded">
                      {s.key}
                    </kbd>
                    <span className="text-muted-foreground">{s.action}</span>
                  </div>
                ))}
              </div>
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
