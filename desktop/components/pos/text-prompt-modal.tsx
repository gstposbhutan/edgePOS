"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface TextPromptRequest {
  title: string;
  /** What the text is for — shown above the field. */
  label: string;
  initial?: string;
  placeholder?: string;
  maxLength?: number;
  onSubmit: (value: string) => void;
}

/**
 * Ask the cashier for a line of text (Ctrl+T item remark).
 *
 * The third of the prompt trio — AmountPromptModal for numbers, DatePromptModal for dates, this
 * for text. They exist because window.prompt is NOT implemented in Electron: it throws, so the
 * shortcuts that called it failed outright in the packaged app while working in a browser.
 *
 * Unlike the amount prompt, an EMPTY submit is meaningful here — it clears the remark — so a
 * blank value is passed through rather than treated as a cancel.
 */
export function TextPromptModal({
  request,
  onClose,
}: {
  request: TextPromptRequest | null;
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
    request.onSubmit(value.trim());
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm" data-testid="text-prompt">
        <DialogHeader>
          <DialogTitle>{request.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label htmlFor="text-prompt" className="text-xs text-muted-foreground">
            {request.label}
          </label>
          {/* A plain input, not the shared Input: the base-ui primitive behind it does not
              forward `id`, which breaks both the label association and any lookup by id. */}
          <input
            id="text-prompt"
            ref={ref}
            type="text"
            value={value}
            maxLength={request.maxLength ?? 200}
            placeholder={request.placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); submit(); }
              if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
            }}
            className="h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring"
            autoFocus
          />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Esc — Cancel</Button>
            <Button className="flex-1" onClick={submit}>Enter — Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
