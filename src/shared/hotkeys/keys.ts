/**
 * Canonical hotkey strings look like "Ctrl + Shift + D" (modifiers in Ctrl, Shift, Alt order,
 * then exactly one main key). The empty string means "unbound".
 * Key names map to Windows virtual-key codes in ./vk for the copy keystroke.
 */

export const MODIFIERS = ['Ctrl', 'Shift', 'Alt'] as const
export type Modifier = (typeof MODIFIERS)[number]

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const DIGITS = '0123456789'.split('')
const FKEYS = Array.from({ length: 24 }, (_, i) => `F${i + 1}`)
const NUMPAD = [
  ...DIGITS.map((d) => `Numpad${d}`),
  'NumpadAdd',
  'NumpadSubtract',
  'NumpadMultiply',
  'NumpadDivide',
  'NumpadDecimal',
]
const NAMED = [
  'Space',
  'Tab',
  'Enter',
  'Escape',
  'Backspace',
  'Delete',
  'Insert',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]
const PUNCTUATION: Record<string, string> = {
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
}

export const MAIN_KEYS: readonly string[] = [
  ...LETTERS,
  ...DIGITS,
  ...FKEYS,
  ...NUMPAD,
  ...NAMED,
  ...Object.keys(PUNCTUATION),
]
const MAIN_KEY_SET = new Set(MAIN_KEYS)

export interface Combo {
  ctrl: boolean
  shift: boolean
  alt: boolean
  key: string
}

/** Parses a canonical or loosely written combo ("ctrl+d", "Ctrl + D"). Returns null if invalid. */
export function parseCombo(text: string): Combo | null {
  const parts = text
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean)
  if (!parts.length) return null
  const combo: Combo = { ctrl: false, shift: false, alt: false, key: '' }
  for (const raw of parts) {
    const part = normalizeKeyName(raw)
    if (part === 'Ctrl') combo.ctrl = true
    else if (part === 'Shift') combo.shift = true
    else if (part === 'Alt') combo.alt = true
    else if (MAIN_KEY_SET.has(part) && !combo.key) combo.key = part
    else return null
  }
  return combo.key ? combo : null
}

export function formatCombo(combo: Combo): string {
  const parts: string[] = []
  if (combo.ctrl) parts.push('Ctrl')
  if (combo.shift) parts.push('Shift')
  if (combo.alt) parts.push('Alt')
  parts.push(combo.key)
  return parts.join(' + ')
}

/** Canonical form of a combo string, or '' when it is empty or invalid. */
export function normalizeCombo(text: string): string {
  const combo = parseCombo(text)
  return combo ? formatCombo(combo) : ''
}

/** Human label, e.g. "Ctrl + ;" for "Ctrl + Semicolon". */
export function displayCombo(text: string): string {
  const combo = parseCombo(text)
  if (!combo) return ''
  return formatCombo({ ...combo, key: PUNCTUATION[combo.key] ?? combo.key })
}

const ELECTRON_KEY: Record<string, string> = {
  Enter: 'Return',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  NumpadAdd: 'numadd',
  NumpadSubtract: 'numsub',
  NumpadMultiply: 'nummult',
  NumpadDivide: 'numdiv',
  NumpadDecimal: 'numdec',
  Backslash: '\\',
  ...Object.fromEntries(DIGITS.map((d) => [`Numpad${d}`, `num${d}`])),
  ...Object.fromEntries(Object.entries(PUNCTUATION).filter(([k]) => k !== 'Backslash')),
}

/** Electron accelerator string for `globalShortcut.register`. */
export function toAccelerator(text: string): string | null {
  const combo = parseCombo(text)
  if (!combo) return null
  const parts: string[] = []
  if (combo.ctrl) parts.push('Ctrl')
  if (combo.shift) parts.push('Shift')
  if (combo.alt) parts.push('Alt')
  parts.push(ELECTRON_KEY[combo.key] ?? combo.key)
  return parts.join('+')
}

/**
 * Builds a combo from a DOM KeyboardEvent (`code` plus modifier flags), for the hotkey recorder.
 * Returns null while only modifiers are held.
 */
export function comboFromKeyboardEvent(e: {
  code: string
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}): string | null {
  let key = e.code
  if (key.startsWith('Key')) key = key.slice(3)
  else if (key.startsWith('Digit')) key = key.slice(5)
  else if (key === 'NumpadEnter') key = 'Enter'
  if (!MAIN_KEY_SET.has(key)) return null
  return formatCombo({ ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, key })
}

function normalizeKeyName(raw: string): string {
  const lower = raw.toLowerCase()
  if (lower === 'ctrl' || lower === 'control') return 'Ctrl'
  if (lower === 'shift') return 'Shift'
  if (lower === 'alt') return 'Alt'
  if (lower === 'esc') return 'Escape'
  if (raw.length === 1 && /[a-z]/i.test(raw)) return raw.toUpperCase()
  const punct = Object.entries(PUNCTUATION).find(([, ch]) => ch === raw)
  if (punct) return punct[0]
  const named = MAIN_KEYS.find((k) => k.toLowerCase() === lower)
  return named ?? raw
}
