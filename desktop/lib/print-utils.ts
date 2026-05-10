export function openPrintWindow(title: string, contentHtml: string, styles?: string): void {
  const w = window.open("", "_blank");
  if (!w) return;

  const css = styles || `
    body { font-family: sans-serif; padding: 20px; max-width: 320px; margin: 0 auto; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { padding: 4px; text-align: left; }
    th { border-bottom: 1px solid #ccc; }
    .right { text-align: right; }
    .total { font-weight: bold; border-top: 1px solid #000; margin-top: 8px; padding-top: 8px; }
    .signature { font-size: 10px; word-break: break-all; color: #666; margin-top: 12px; }
  `;

  w.document.write(`<html><head><title>${title}</title><style>${css}</style></head><body>${contentHtml}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); w.close(); }, 250);
}
