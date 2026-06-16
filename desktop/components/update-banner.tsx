"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type Release = {
  version: string;
  notes?: string;
  download_url?: string;
  mandatory?: boolean;
};

/**
 * Shows a banner when the main process reports a newer Pelbu POS release.
 * Desktop-only — in a plain browser `window.electronAPI` is undefined and this
 * renders nothing.
 */
export function UpdateBanner() {
  const [release, setRelease] = useState<Release | null>(null);

  useEffect(() => {
    const api = (window as unknown as { electronAPI?: any }).electronAPI;
    if (!api?.update?.onAvailable) return;
    const off = api.update.onAvailable((r: Release) => setRelease(r));
    return typeof off === "function" ? off : undefined;
  }, []);

  if (!release) return null;

  const openDownload = () => {
    const api = (window as unknown as { electronAPI?: any }).electronAPI;
    api?.update?.openDownload?.(release.download_url);
  };

  return (
    <div className="w-full bg-primary/10 border-b border-primary/30 px-4 py-2 flex items-center justify-between gap-3 text-sm shrink-0">
      <span className="text-foreground">
        A new version (<strong>{release.version}</strong>) of Pelbu POS is available
        {release.mandatory ? " (required)" : ""}.
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={openDownload}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90"
        >
          <Download className="h-3.5 w-3.5" /> Download update
        </button>
        {!release.mandatory && (
          <button onClick={() => setRelease(null)} className="text-muted-foreground hover:text-foreground" title="Dismiss">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
