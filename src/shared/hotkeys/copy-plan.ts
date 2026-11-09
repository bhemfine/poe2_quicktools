import { parseCombo } from './keys'

export interface CopyPlan {
  /** Keys of the triggering hotkey that must go up first (its main key and unneeded modifiers). */
  release: string[]
  /** Keys to hold down before tapping C (not already held by the user). */
  press: string[]
}

/**
 * Plans the single synthetic copy action (PLAN §5.5): Ctrl + <advanced descriptions key> + C.
 * Modifiers the user is already holding for the hotkey are reused instead of pressed again.
 */
export function planCopyKeystroke(hotkey: string, advancedKey: string): CopyPlan {
  const combo = parseCombo(hotkey)
  const held = new Set<string>()
  if (combo?.ctrl) held.add('Ctrl')
  if (combo?.shift) held.add('Shift')
  if (combo?.alt) held.add('Alt')

  const needed = ['Ctrl', advancedKey || 'Alt'].filter((k, i, a) => a.indexOf(k) === i)

  const release: string[] = []
  if (combo && combo.key !== 'C') release.push(combo.key)
  for (const mod of held) if (!needed.includes(mod)) release.push(mod)

  return { release, press: needed.filter((k) => !held.has(k)) }
}
