"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { OfficeMenu } from "@/components/pos/keyboard/office-menu"
import { OFFICE_KEY_BAR } from "@/lib/pos/office-keys"

/**
 * The back-office frame (spec WF-08/WF-09), the counter's other half.
 *
 * The till already fills the screen with the ticket and states the standing facts on one strip.
 * A back-office screen owes a shopkeeper the same three things in the same three places: WHICH
 * screen this is (the band), WHAT the screen holds (the body), and WHICH KEY does what (the
 * rail). Shops arriving from the incumbent ERP read a screen in that order by reflex, so a
 * report that hides its keys in a toolbar reads as broken to them even when it works.
 *
 * The frame does not touch what a screen already does — the pages keep their own tabs, modals
 * and hooks. It supplies the chrome and the key rail, and answers the two keys every office
 * screen owes: Esc back to the counter, and Alt+O for the letter menu. Alt+O matters more here
 * than on the till: these screens are full-bleed with no pointer rail, so the letters ARE the
 * navigation, and a shopkeeper crossing from a report to a register must not have to return to
 * the ticket to do it.
 *
 * The mirror of the till's TillBar + ShortcutBar pairing; keep the three in step.
 *
 * @param {string}   title    The screen's own name — the band's left half.
 * @param {string}   [crumb]  Where it sits, e.g. "Warehouse Management" — printed before title.
 * @param {Array}    [keys]   Function-key entries: { key, label, onClick, todo }.
 * @param {string}   [date]   Right half of the band. Defaults to today, the way a voucher dates.
 * @param {boolean}  [escToCounter=true]  Esc returns to the ticket.
 */
export function OfficeShell({ title, crumb, keys = [], date, escToCounter = true, children }) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)

  // Esc is the one key that means the same thing on every back-office screen. It stands down
  // while something is being typed, so a half-filled search field is not a trapdoor.
  useEffect(() => {
    if (!escToCounter) return
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      const el = e.target
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      // The menu owns Escape while it is up — it closes itself, and closing it must not also
      // throw the screen back to the till underneath.
      if (menuOpen) return
      e.preventDefault()
      router.push('/pos')
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [escToCounter, router, menuOpen])

  // Alt+O — the letter menu, the same combo the till uses.
  useEffect(() => {
    const onKey = (e) => {
      if (!e.altKey || e.key.toLowerCase() !== 'o') return
      e.preventDefault()
      setMenuOpen(o => !o)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const stamp = date ?? new Date().toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).replace(/ /g, '-')

  const rail = [
    ...(keys.length ? keys : OFFICE_KEY_BAR),
    { key: 'Alt+O', label: 'Office', onClick: () => setMenuOpen(true) },
  ]

  return (
    <div className="office-ui flex flex-col min-h-screen" style={{ background: 'var(--office-page-bg)' }}>
      <div
        className="flex items-center justify-between px-4 py-1.5 text-[13px] shrink-0"
        style={{ background: 'var(--office-title-bg)', color: 'var(--office-title-fg)' }}
        data-testid="office-band"
      >
        <h1 className="font-bold truncate text-[13px] m-0">
          {crumb ? <span className="font-normal opacity-80">{crumb} &rsaquo; </span> : null}
          {title}
        </h1>
        <span className="tabular-nums whitespace-nowrap pl-3">{stamp}</span>
      </div>

      <main className="flex-1 min-h-0 overflow-auto p-3">{children}</main>

      <OfficeKeyRail keys={rail} />

      <OfficeMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  )
}

/** The rail: every key the screen answers, printed. A key that is not built says so. */
export function OfficeKeyRail({ keys = [] }) {
  return (
    <div
      className="flex flex-wrap gap-px p-1 shrink-0 border-t"
      style={{ borderColor: 'var(--office-line)' }}
      data-testid="office-rail"
    >
      {keys.map(({ key, label, onClick, todo }) => (
        <button
          key={`${key}-${label}`}
          type="button"
          onClick={todo ? undefined : onClick}
          aria-disabled={todo || !onClick ? 'true' : undefined}
          title={todo ? 'Not built yet' : undefined}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] leading-none ${todo ? 'opacity-45 cursor-default' : onClick ? 'cursor-pointer hover:brightness-125' : 'cursor-default'}`}
          style={{ background: 'var(--office-key-bg)', color: 'var(--office-key-fg)' }}
        >
          <span className="font-bold">{key}</span>
          <span className="opacity-90">{label}</span>
        </button>
      ))}
    </div>
  )
}
