// Turning a printed key label back into a keystroke.
//
// The rails print combos as a shopkeeper reads them — "F10", "Ctrl+D", "Alt+⇧L", "Del". Tapping
// one of those buttons re-dispatches the keydown it names, so the handler that already answers
// the KEY answers the tap too. One path, and a button can never drift from the key beside it.
//
// Extracted from components/pos/keyboard/listing-footer.tsx (2026-08-25) so the office rail uses
// the same parser instead of a second copy of it.

const NAMED_KEYS: Record<string, string> = {
  del: "Delete", delete: "Delete", esc: "Escape", escape: "Escape", enter: "Enter", tab: "Tab", space: " ",
  pgup: "PageUp", pgdn: "PageDown",
};

/**
 * Map a display label to a KeyboardEvent init, or null when it names no single dispatchable key.
 */
export function keyEventInit(label: string): KeyboardEventInit | null {
  const init: KeyboardEventInit = { bubbles: true, cancelable: true };
  let key: string | null = null;
  for (let part of label.split("+")) {
    part = part.trim();
    if (!part) continue;
    if (/^(ctrl|control)$/i.test(part)) { init.ctrlKey = true; continue; }
    if (/^alt$/i.test(part))            { init.altKey = true;  continue; }
    if (/^shift$/i.test(part))          { init.shiftKey = true; continue; }
    if (part.startsWith("⇧"))           { init.shiftKey = true; part = part.slice(1); }
    const low = part.toLowerCase();
    if (NAMED_KEYS[low])               key = NAMED_KEYS[low];
    else if (/^f\d{1,2}$/i.test(part)) key = part.toUpperCase();
    else if (part.length === 1)      { key = part.toLowerCase(); init.code = `Key${part.toUpperCase()}`; }
  }
  if (!key) return null;
  init.key = key;
  // `code` matters for the Alt combos, which the registry matches on the physical key because
  // macOS rewrites the glyph. A synthesised event without it would never match.
  return init;
}

/** Fire the keystroke a label names, so the registry handles a tap exactly like the key. */
export function triggerShortcut(label: string): void {
  const init = keyEventInit(label);
  if (!init) return;
  const el = document.activeElement as HTMLElement | null;
  if (el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) el.blur?.();
  document.dispatchEvent(new KeyboardEvent("keydown", init));
}
