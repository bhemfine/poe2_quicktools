import { HOTKEY_ACTIONS, HOTKEY_LABELS, type HotkeyAction, type HotkeyBindings } from './actions'
import { displayCombo, normalizeCombo, parseCombo } from './keys'

export interface GameBind {
  combo: string
  action: string
  /** Only relevant when the user plays with WASD movement. */
  wasd?: boolean
}

export type IssueCode =
  'duplicate' | 'invalid' | 'windows-reserved' | 'game-bind' | 'bare-key' | 'register-failed'

export interface HotkeyIssue {
  level: 'error' | 'warning'
  code: IssueCode
  message: string
}

const WINDOWS_RESERVED = new Set(['Alt + Tab', 'Alt + F4', 'Ctrl + Alt + Delete', 'Ctrl + Escape'])

/** Actions where a bare key is expected and not worth a warning. */
const BARE_KEY_OK = new Set<HotkeyAction>(['dismiss'])

export interface ValidateOptions {
  gameBinds: readonly GameBind[]
  wasdMode: boolean
}

/** Checks one candidate combo for `action` against the other bindings and the game's binds. */
export function validateHotkey(
  action: HotkeyAction,
  combo: string,
  bindings: HotkeyBindings,
  opts: ValidateOptions,
): HotkeyIssue[] {
  if (!combo) return []
  const normalized = normalizeCombo(combo)
  if (!normalized)
    return [{ level: 'error', code: 'invalid', message: 'Not a valid key combination.' }]

  const issues: HotkeyIssue[] = []
  for (const other of HOTKEY_ACTIONS) {
    if (other !== action && normalizeCombo(bindings[other]) === normalized) {
      issues.push({
        level: 'error',
        code: 'duplicate',
        message: `Already used by "${HOTKEY_LABELS[other]}".`,
      })
    }
  }

  if (WINDOWS_RESERVED.has(normalized)) {
    issues.push({ level: 'error', code: 'windows-reserved', message: 'Reserved by Windows.' })
  }

  for (const bind of opts.gameBinds) {
    if (bind.wasd && !opts.wasdMode) continue
    if (normalizeCombo(bind.combo) === normalized) {
      issues.push({
        level: 'warning',
        code: 'game-bind',
        message: `PoE 2 uses ${displayCombo(normalized)} for "${bind.action}". QuickTools will take it over while the game is focused.`,
      })
    }
  }

  const parsed = parseCombo(normalized)!
  if (!parsed.ctrl && !parsed.alt && !parsed.shift && !BARE_KEY_OK.has(action)) {
    issues.push({
      level: 'warning',
      code: 'bare-key',
      message: 'No modifier: the key stops reaching the game while PoE 2 is focused.',
    })
  }
  return issues
}

export function validateAll(
  bindings: HotkeyBindings,
  opts: ValidateOptions,
): Record<HotkeyAction, HotkeyIssue[]> {
  return Object.fromEntries(
    HOTKEY_ACTIONS.map((a) => [a, validateHotkey(a, bindings[a], bindings, opts)]),
  ) as Record<HotkeyAction, HotkeyIssue[]>
}

export function hasBlockingIssue(issues: readonly HotkeyIssue[]): boolean {
  return issues.some((i) => i.level === 'error')
}
