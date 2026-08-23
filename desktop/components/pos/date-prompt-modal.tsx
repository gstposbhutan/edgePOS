"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface DatePromptRequest {
  title: string;
  /** What the date means — shown above the field. */
  label: string;
  /** Current value as a `datetime-local` string, or null for "not overridden". */
  initial?: string | null;
  onSubmit: (value: string | null) => void;
}

/** `datetime-local` wants local wall-clock, not the ISO/UTC string toISOString gives. */
function localNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * F2 — the bill date (spec: "F2 Date — sets bill date to today").
 *
 * Separate from AmountPromptModal, which is a number field; both exist because window.prompt is
 * not implemented in Electron and throws. "Today" clears the override rather than stamping a
 * fixed timestamp, so a ticket rung an hour later still carries its own time.
 */
export function DatePromptModal({
  request,
  onClose,
}: {
  request: DatePromptRequest | null;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!request) return;
    setValue(request.initial || localNow());
    const t = setTimeout(() => ref.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [request]);

  if (!request) return null;

  const submit = (next: string | null) => {
    request.onSubmit(next);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm" data-testid="date-prompt">
        <DialogHeader>
          <DialogTitle>{request.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label htmlFor="date-prompt" className="text-xs text-muted-foreground">
            {request.label}
          </label>
          {/* A plain input, not the shared Input: the base-ui primitive behind it does not
              forward `id`, which breaks both the label association and any lookup by id. */}
          <input
            id="date-prompt"
            ref={ref}
            type="datetime-local"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); submit(value || null); }
              if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
            }}
            className="h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring"
            autoFocus
          />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Esc — Cancel</Button>
            <Button variant="outline" className="flex-1" onClick={() => submit(null)}>Today</Button>
            <Button className="flex-1" onClick={() => submit(value || null)}>Enter — Set</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
