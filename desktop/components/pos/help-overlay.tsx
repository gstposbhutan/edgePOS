"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { COUNTER_KEYS, COUNTER_NAV } from "@/lib/pos-shortcuts";

interface HelpOverlayProps {
  open: boolean;
  onClose: () => void;
}

// Rendered from the shared key map, so the sheet can only ever show what the keys really do —
// this list and the bindings used to be maintained separately and had drifted apart.
const MAP_GROUPS = ["Line", "Sale", "Ticket", "Pelbu"];

const GROUPS: { title: string; shortcuts: { key: string; action: string; stub?: boolean }[] }[] = [
  ...MAP_GROUPS.map((title) => ({
    title,
    shortcuts: COUNTER_KEYS.filter((e) => e.group === title).map((e) => ({
      key: e.combo,
      action: e.label,
      stub: e.todo,
    })),
  })),
  {
    title: "Moving around",
    shortcuts: COUNTER_NAV.map((n) => ({ key: n.combo, action: n.label })),
  },
  {
    title: "Window",
    shortcuts: [{ key: "Alt+Enter", action: "Full screen" }],
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
              <h3 className="text-xs font-semibold uppercase tracking-wide mb-1 text-muted-foreground">
                {group.title}
              </h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {group.shortcuts.map((s) => (
                  <div key={s.key + s.action} className={`flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 ${s.stub ? "opacity-50" : ""}`}>
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
