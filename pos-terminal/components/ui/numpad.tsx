"use client";

import { Delete } from "lucide-react";
import { NUMPAD_MAX_VALUE } from "@/lib/constants";

const KEYS = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
  [null, 0, "backspace"],
] as const;

interface NumpadProps {
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function Numpad({ value, onChange, onConfirm, onCancel }: NumpadProps) {
  const handleKey = (key: number | string | null) => {
    if (key === null) return;
    if (key === "backspace") {
      onChange(value.slice(0, -1) || "");
    } else {
      const next = value + key;
      if (parseInt(next) <= NUMPAD_MAX_VALUE) onChange(next);
    }
  };

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {KEYS.map((row, ri) =>
        row.map((key, ci) => (
          <button
            key={`${ri}-${ci}`}
            onClick={() => handleKey(key)}
            className={`h-10 rounded-md text-sm font-medium transition-colors active:scale-95 ${
              key === null
                ? ""
                : key === "backspace"
                ? "bg-muted hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                : "bg-muted hover:bg-primary/20 hover:text-primary"
            }`}
          >
            {key === "backspace" ? <Delete className="h-4 w-4 mx-auto" /> : key}
          </button>
        ))
      )}
      <button
        onClick={onCancel}
        className="h-10 rounded-md text-sm font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 active:scale-95"
      >
        ✕
      </button>
      <button
        onClick={() => onChange("")}
        className="h-10 rounded-md text-sm font-medium bg-muted hover:bg-muted/80 text-muted-foreground active:scale-95"
      >
        C
      </button>
      <button
        onClick={onConfirm}
        className="h-10 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95"
      >
        ✓
      </button>
    </div>
  );
}
