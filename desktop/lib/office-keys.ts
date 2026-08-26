// The back-office key rails on the terminal (spec WF-08/WF-09).
//
// The mirror of web/lib/pos/office-keys.js — same letters, same labels, so a shopkeeper moving
// between the terminal and the browser presses the same key for the same thing. ONE difference is
// deliberate: Location is the real F12 here. On the web F12 belongs to the browser's devtools and
// no page can cancel it, so the web rail carries Ctrl+⇧L instead; a terminal has no such owner and
// can honour the key the incumbent actually uses.
//
// A key with no handler is `todo`: printed dimmed and says so, rather than looking broken or
// silently doing nothing under a trained reflex.

export interface OfficeKey {
  key: string;
  label: string;
  onClick?: () => void;
  todo?: boolean;
}

/** What every back-office screen answers. */
export const OFFICE_KEY_BAR: OfficeKey[] = [
  { key: "Esc", label: "Counter" },
];

/** Report screens: the reading keys. */
export const REPORT_KEYS: OfficeKey[] = [
  { key: "F2",  label: "Date",     todo: true },
  { key: "P",   label: "Print",    todo: true },
  { key: "F12", label: "Location", todo: true },
  { key: "Esc", label: "Counter" },
];

/** Master-data screens. */
export const MASTER_KEYS: OfficeKey[] = [
  { key: "N",   label: "New",     todo: true },
  { key: "E",   label: "Edit",    todo: true },
  { key: "L",   label: "List",    todo: true },
  { key: "Esc", label: "Counter" },
];

/** Attach real handlers to a template by key; anything unhandled stays dimmed. */
export function withHandlers(
  template: OfficeKey[],
  handlers: Record<string, () => void> = {},
): OfficeKey[] {
  return template.map((entry) => {
    const fn = handlers[entry.key];
    return fn ? { ...entry, onClick: fn, todo: false } : entry;
  });
}
