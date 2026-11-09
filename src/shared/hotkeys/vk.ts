/**
 * Windows virtual-key codes for the key names in ./keys (plus the three modifiers), used to send
 * the copy keystroke with SendInput. Modifiers map to their left-hand keys.
 */
const NAMED: Record<string, number> = {
  Ctrl: 0xa2,
  Shift: 0xa0,
  Alt: 0xa4,
  Space: 0x20,
  Tab: 0x09,
  Enter: 0x0d,
  Escape: 0x1b,
  Backspace: 0x08,
  Delete: 0x2e,
  Insert: 0x2d,
  Home: 0x24,
  End: 0x23,
  PageUp: 0x21,
  PageDown: 0x22,
  ArrowLeft: 0x25,
  ArrowUp: 0x26,
  ArrowRight: 0x27,
  ArrowDown: 0x28,
  NumpadMultiply: 0x6a,
  NumpadAdd: 0x6b,
  NumpadSubtract: 0x6d,
  NumpadDecimal: 0x6e,
  NumpadDivide: 0x6f,
  Minus: 0xbd,
  Equal: 0xbb,
  BracketLeft: 0xdb,
  BracketRight: 0xdd,
  Backslash: 0xdc,
  Semicolon: 0xba,
  Quote: 0xde,
  Comma: 0xbc,
  Period: 0xbe,
  Slash: 0xbf,
  Backquote: 0xc0,
}

/** Keys that need KEYEVENTF_EXTENDEDKEY so the scan code matches the real key. */
const EXTENDED = new Set([
  'Delete',
  'Insert',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'ArrowLeft',
  'ArrowUp',
  'ArrowRight',
  'ArrowDown',
  'NumpadDivide',
])

export function virtualKeyCode(name: string): number | undefined {
  if (/^[A-Z0-9]$/.test(name)) return name.charCodeAt(0)
  const f = /^F(\d{1,2})$/.exec(name)
  if (f && +f[1] >= 1 && +f[1] <= 24) return 0x6f + +f[1]
  const n = /^Numpad(\d)$/.exec(name)
  if (n) return 0x60 + +n[1]
  return NAMED[name]
}

export function isExtendedKey(name: string): boolean {
  return EXTENDED.has(name)
}
