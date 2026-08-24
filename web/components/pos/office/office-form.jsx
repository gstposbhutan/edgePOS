"use client"

/**
 * The master-data form (spec WF-09) — a product card read as a sheet, not a wizard.
 *
 * The incumbent's product screen puts the whole record on ONE screen in two columns under
 * underlined section heads, so an owner checking a rate does not page through steps to find it.
 * That is the property worth keeping: everything visible, sections as landmarks, label on the
 * left and value on the right in a fixed column so the eye runs straight down the values.
 *
 * These are presentational. The pages keep their own state, validation and save.
 */

/** The sheet: two columns on a real screen, one when there is not room. */
export function OfficeForm({ children, className = '' }) {
  return (
    <div
      className={`p-4 border ${className}`}
      style={{ background: 'var(--office-panel-bg)', borderColor: 'var(--office-line)' }}
    >
      <div className="grid gap-x-10 gap-y-0 md:grid-cols-2">{children}</div>
    </div>
  )
}

/** A landmark. The rule under it is what makes the sheet scannable. */
export function OfficeSection({ title, children, className = '' }) {
  return (
    <section className={`mb-4 break-inside-avoid ${className}`}>
      <h3
        className="text-[12px] font-bold pb-0.5 mb-1.5 border-b"
        style={{ borderColor: 'currentColor' }}
      >
        {title}
      </h3>
      <div>{children}</div>
    </section>
  )
}

/**
 * One label/value line. Read-only by default — pass `children` to put a control in the slot.
 * `lookup` prints the "?" the incumbent uses to mark a field that opens a picker, so the mark
 * means the same thing here as it did there.
 */
export function OfficeField({ label, value, lookup = false, children }) {
  return (
    <div className="flex items-baseline gap-2 py-[3px] text-[12px]">
      <span className="w-[150px] shrink-0 flex items-baseline gap-1">
        {label}
        {lookup && <span className="opacity-50" aria-hidden>?</span>}
      </span>
      <span className="flex-1 min-w-0 font-medium truncate">
        {children ?? (value === '' || value == null ? <span className="opacity-40">—</span> : value)}
      </span>
    </div>
  )
}
