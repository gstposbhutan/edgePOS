// Renderer-only helper: print a single barcode label via the OS print dialog.
// Builds the printable HTML with renderLabelDocument() (tested in labels.test.ts) and
// opens it in a print window — the same window.print() pattern the receipt modal uses.
// Hardware-agnostic: the @page size in the document targets the label printer / roll.
import { renderLabelDocument, DEFAULT_LABEL_CONFIG } from "./labels";
import type { LabelItem, LabelConfig } from "./labels";

export function printLabel(
  item: LabelItem,
  config: LabelConfig = DEFAULT_LABEL_CONFIG,
  copies: number = config.copies ?? 1,
): boolean {
  const html = renderLabelDocument(item, config, copies);
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
    win.close();
  }, 250);
  return true;
}
