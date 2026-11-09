// Adapted from Exiled-Exchange-2 main/src/shortcuts/Shortcuts.ts (pressKeysToCopyItemText) @ cca30662 (MIT). Modified.
import { uIOhook, UiohookKey } from 'uiohook-napi'
import { planCopyKeystroke } from '../../shared/hotkeys/copy-plan'

type KeyName = keyof typeof UiohookKey

function code(key: string): number | undefined {
  return UiohookKey[key as KeyName]
}

/**
 * Sends Ctrl + <advanced key> + C to the focused game window. This is the only synthetic input
 * QuickTools ever sends, once per hotkey press (PLAN §1.4 rule 2).
 */
export function pressCopyItemText(hotkey: string, advancedKey: string): void {
  const plan = planCopyKeystroke(hotkey, advancedKey)
  for (const key of plan.release) {
    const c = code(key)
    if (c !== undefined) uIOhook.keyToggle(c, 'up')
  }
  const pressed: number[] = []
  for (const key of plan.press) {
    const c = code(key)
    if (c === undefined) continue
    uIOhook.keyToggle(c, 'down')
    pressed.push(c)
  }
  uIOhook.keyTap(UiohookKey.C)
  // The game sometimes drops key-up events sent immediately, so release a little later.
  setTimeout(() => {
    for (const c of pressed.reverse()) uIOhook.keyToggle(c, 'up')
  }, 10)
}
