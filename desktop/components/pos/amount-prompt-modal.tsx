"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface AmountPromptRequest {
  title: string;
  /** What the number means, e.g. "Discount per unit" — shown above the field. */
  label: string;
  /** Unit shown beside the field, e.g. "%" or "Nu." */
  suffix?: string;
  initial?: string;
  onSubmit: (value: number) => void;
}

/**
 * Ask the cashier for a number.
 *
 * This exists because window.prompt() is NOT implemented in Electron — it throws. The
 * discount shortcuts called it, so they failed outright in the packaged app while working
 * in a browser, which is why it went unnoticed.
 *
 * Enter confirms and Escape cancels, so a keyboard-driven counter never has to reach for the
 * mouse to answer it.
 */
export function AmountPromptModal({
  request,
  onClose,
}: {
  request: AmountPromptRequest | null;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!request) return;
    setValue(request.initial ?? "");
    const t = setTimeout(() => ref.current?.select(), 30);
    return () => clearTimeout(t);
  }, [request]);

  if (!request) return null;

  const submit = () => {
    const parsed = parseFloat(value);
    // A blank or unparseable entry cancels rather than booking a zero — a silent 0% discount
    // looks identical to "nothing happened", and a silent 0 rate would be a giveaway.
    if (!isNaN(parsed)) request.onSubmit(parsed);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{request.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label htmlFor="amount-prompt" className="text-xs text-muted-foreground">
            {request.label}
          </label>
          <div className="flex items-center gap-2">
            {/* A plain input, not the shared Input: the base-ui primitive behind it does not
                forward `id`, which breaks both this label association and any lookup by id. */}
            <input
              id="amount-prompt"
              ref={ref}
              type="number"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); submit(); }
                if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
              }}
              className="h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-right text-sm tabular-nums outline-none focus-visible:border-ring"
              autoFocus
            />
            {request.suffix && <span className="text-sm text-muted-foreground">{request.suffix}</span>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Esc — Cancel</Button>
            <Button className="flex-1" onClick={submit}>Enter — Apply</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
