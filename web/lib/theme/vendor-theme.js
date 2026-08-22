// Per-vendor POS colour themes (meeting 2026-08-11 decision: vendors pick their own
// palette/contrast for the POS UI). Framework-agnostic — imported by BOTH the server
// layout (which injects a <style> flash-free) and the client settings form (live preview),
// plus the settings API (server-side sanitising). No DOM/Node APIs in here.
//
// The base :root in globals.css is the "champagne" palette. A theme is a preset (a coherent
// override of the brand-related CSS vars) optionally with a custom brand colour that replaces
// just the primary/brand hue (foreground text auto-picked for contrast).

// Every preset overrides the SAME set of brand keys so switching one for another is a clean
// swap (no stale vars linger). Neutrals (background, muted, accent, border) stay from :root.
const BRAND_KEYS = [
  '--primary', '--primary-foreground',
  '--secondary', '--secondary-foreground',
  '--ring',
  '--sidebar-primary', '--sidebar-primary-foreground', '--sidebar-ring',
  '--warning', '--chart-1', '--chart-2',
]

export const PRESETS = [
  {
    key: 'champagne',
    label: 'Champagne Gold',
    swatch: ['#C0A269', '#3B4A3A'],
    vars: {
      '--primary': '#C0A269', '--primary-foreground': '#23201B',
      '--secondary': '#3B4A3A', '--secondary-foreground': '#F7F6F2',
      '--ring': '#C0A269',
      '--sidebar-primary': '#C0A269', '--sidebar-primary-foreground': '#23201B', '--sidebar-ring': '#C0A269',
      '--warning': '#C0A269', '--chart-1': '#C0A269', '--chart-2': '#3B4A3A',
    },
  },
  {
    key: 'sapphire',
    label: 'Sapphire Blue',
    swatch: ['#2563EB', '#1E293B'],
    vars: {
      '--primary': '#2563EB', '--primary-foreground': '#FFFFFF',
      '--secondary': '#1E293B', '--secondary-foreground': '#F8FAFC',
      '--ring': '#2563EB',
      '--sidebar-primary': '#2563EB', '--sidebar-primary-foreground': '#FFFFFF', '--sidebar-ring': '#2563EB',
      '--warning': '#F59E0B', '--chart-1': '#2563EB', '--chart-2': '#1E293B',
    },
  },
  {
    key: 'emerald',
    label: 'Emerald',
    swatch: ['#059669', '#064E3B'],
    vars: {
      '--primary': '#059669', '--primary-foreground': '#FFFFFF',
      '--secondary': '#064E3B', '--secondary-foreground': '#ECFDF5',
      '--ring': '#059669',
      '--sidebar-primary': '#059669', '--sidebar-primary-foreground': '#FFFFFF', '--sidebar-ring': '#059669',
      '--warning': '#F59E0B', '--chart-1': '#059669', '--chart-2': '#064E3B',
    },
  },
  {
    key: 'amethyst',
    label: 'Amethyst',
    swatch: ['#7C3AED', '#3B0764'],
    vars: {
      '--primary': '#7C3AED', '--primary-foreground': '#FFFFFF',
      '--secondary': '#3B0764', '--secondary-foreground': '#F5F3FF',
      '--ring': '#7C3AED',
      '--sidebar-primary': '#7C3AED', '--sidebar-primary-foreground': '#FFFFFF', '--sidebar-ring': '#7C3AED',
      '--warning': '#F59E0B', '--chart-1': '#7C3AED', '--chart-2': '#3B0764',
    },
  },
  {
    key: 'rosewood',
    label: 'Rosewood',
    swatch: ['#E11D48', '#4C0519'],
    vars: {
      '--primary': '#E11D48', '--primary-foreground': '#FFFFFF',
      '--secondary': '#4C0519', '--secondary-foreground': '#FFF1F2',
      '--ring': '#E11D48',
      '--sidebar-primary': '#E11D48', '--sidebar-primary-foreground': '#FFFFFF', '--sidebar-ring': '#E11D48',
      '--warning': '#F59E0B', '--chart-1': '#E11D48', '--chart-2': '#4C0519',
    },
  },
  {
    key: 'slate',
    label: 'Graphite',
    swatch: ['#334155', '#64748B'],
    vars: {
      '--primary': '#334155', '--primary-foreground': '#FFFFFF',
      '--secondary': '#0F172A', '--secondary-foreground': '#F1F5F9',
      '--ring': '#334155',
      '--sidebar-primary': '#334155', '--sidebar-primary-foreground': '#FFFFFF', '--sidebar-ring': '#334155',
      '--warning': '#F59E0B', '--chart-1': '#334155', '--chart-2': '#64748B',
    },
  },
]

export const PRESET_KEYS = PRESETS.map((p) => p.key)
export const DEFAULT_PRESET = 'champagne'

/**
 * Strict allow-list for a stored/injected CSS colour. Only hex (#rgb/#rgba/#rrggbb/#rrggbbaa)
 * and the rgb()/rgba()/hsl()/hsla() functional forms with a numeric-only argument list. No
 * semicolons, braces, or angle brackets can pass, so the value is safe to drop into a <style>.
 * Accepts any of the input formats the user might type (hex, rgb, hsl, …); named colours are
 * normalised to hex client-side before they ever reach here.
 */
export function isSafeColor(value) {
  if (typeof value !== 'string') return false
  const v = value.trim()
  if (!v || v.length > 64) return false
  if (/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)) return true
  if (/^(rgb|rgba|hsl|hsla)\(\s*[0-9.,%\s/]+\)$/.test(v)) return true
  return false
}

/** Pull the r,g,b (0–255) out of a hex or rgb()/rgba() colour, or null if not parseable. */
function toRgb(value) {
  const v = String(value).trim()
  let m = v.match(/^#([0-9a-fA-F]{3})([0-9a-fA-F])?$/)
  if (m) {
    const h = m[1]
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]
  }
  m = v.match(/^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/)
  if (m) {
    const h = m[1]
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  m = v.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])]
  return null
}

/**
 * Pick a legible foreground (dark espresso vs white) for a given brand colour using perceived
 * brightness (YIQ). Falls back to dark when the colour can't be parsed (e.g. an hsl()/named
 * form the caller didn't pre-normalise) — the client normalises to hex, so this is a safety net.
 */
export function foregroundFor(value) {
  const rgb = toRgb(value)
  if (!rgb) return '#23201B'
  const [r, g, b] = rgb
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 140 ? '#23201B' : '#FFFFFF'
}

/** The resolved brand-var map for a (preset, customPrimary) pair. Custom colour replaces the hue. */
export function buildThemeVars(presetKey, customPrimary) {
  const preset = PRESETS.find((p) => p.key === presetKey) || PRESETS[0]
  const vars = { ...preset.vars }
  if (customPrimary && isSafeColor(customPrimary)) {
    const fg = foregroundFor(customPrimary)
    vars['--primary'] = customPrimary
    vars['--primary-foreground'] = fg
    vars['--ring'] = customPrimary
    vars['--sidebar-primary'] = customPrimary
    vars['--sidebar-primary-foreground'] = fg
    vars['--sidebar-ring'] = customPrimary
    vars['--warning'] = customPrimary
    vars['--chart-1'] = customPrimary
  }
  return vars
}

/** True when the (preset, custom) pair is just the built-in default and needs no override at all. */
export function isDefaultTheme(presetKey, customPrimary) {
  return (!presetKey || presetKey === DEFAULT_PRESET) && !customPrimary
}

/**
 * A CSS rule string of the brand-var overrides, e.g. ":root{--primary:#2563EB;…}". `selector`
 * defaults to :root (the layout injects globally); the live preview passes the same.
 */
export function buildThemeCss(presetKey, customPrimary, selector = ':root') {
  const vars = buildThemeVars(presetKey, customPrimary)
  const body = BRAND_KEYS.filter((k) => vars[k]).map((k) => `${k}:${vars[k]}`).join(';')
  return `${selector}{${body}}`
}
