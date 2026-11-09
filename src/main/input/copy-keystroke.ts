// Adapted from Exiled-Exchange-2 main/src/shortcuts/Shortcuts.ts (pressKeysToCopyItemText) @ cca30662 (MIT). Modified.
import { planCopyKeystroke } from '../../shared/hotkeys/copy-plan'
import { sendKey } from './send-input'

/**
 * Sends Ctrl + <advanced key> + C to the focused game window. This is the only synthetic input
 * QuickTools ever sends, once per hotkey press (PLAN §1.4 rule 2).
 */
export function pressCopyItemText(hotkey: string, advancedKey: string): void {
  const plan = planCopyKeystroke(hotkey, advancedKey)
  for (const key of plan.release) sendKey(key, 'up')
  const pressed = plan.press.filter((key) => sendKey(key, 'down'))
  sendKey('C', 'down')
  sendKey('C', 'up')
  // The game sometimes drops key-up events sent immediately, so release a little later.
  setTimeout(() => {
    for (const key of pressed.reverse()) sendKey(key, 'up')
  }, 10)
}
