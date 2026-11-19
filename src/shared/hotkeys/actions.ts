import defaults from '../../../config/default-hotkeys.json'
import { normalizeCombo } from './keys'

export const HOTKEY_ACTIONS = [
  'price-check',
  'converter-hud',
  'toggle-interactive',
  'open-ninja',
  'toggle-cheatsheet',
  'dismiss',
  'save-item-text',
] as const
export type HotkeyAction = (typeof HOTKEY_ACTIONS)[number]

export type HotkeyBindings = Record<HotkeyAction, string>

export const HOTKEY_LABELS: Record<HotkeyAction, string> = {
  'price-check': 'Price check (hover an item, then press)',
  'converter-hud': 'Open / close the currency converter',
  'toggle-interactive': 'Click the price window (press again to go back to the game)',
  'open-ninja': 'Open the priced item on poe.ninja',
  'toggle-cheatsheet': 'Show / hide the on-screen key list',
  dismiss: 'Close the price window or converter',
  'save-item-text': 'Save last item text as test fixture (dev tools)',
}

/** Actions registered only while their condition holds; the rest are registered while PoE 2 is focused. */
export const CONDITIONAL_ACTIONS: Partial<Record<HotkeyAction, 'card-open' | 'dev-tools'>> = {
  dismiss: 'card-open',
  'save-item-text': 'dev-tools',
}

export const DEFAULT_HOTKEYS: HotkeyBindings = Object.fromEntries(
  HOTKEY_ACTIONS.map((a) => [a, normalizeCombo((defaults as Record<string, string>)[a] ?? '')]),
) as HotkeyBindings

export function isHotkeyAction(value: unknown): value is HotkeyAction {
  return (HOTKEY_ACTIONS as readonly unknown[]).includes(value)
}
