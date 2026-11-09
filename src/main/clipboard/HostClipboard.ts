// Adapted from Exiled-Exchange-2 main/src/shortcuts/HostClipboard.ts @ cca30662 (MIT). Modified:
// Electron 45's clipboard API is async, and only English item text is detected.
import { clipboard } from 'electron'
import { isPoeItemText } from '../../shared/clipboard'

const POLL_DELAY = 48
const POLL_LIMIT = 500

export class ClipboardTimeoutError extends Error {
  constructor() {
    super('Reading clipboard timed out')
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Waits for PoE 2 to put item text on the clipboard after the copy keystroke, then puts back
 * whatever the user had copied before (when `restore` is on).
 */
export class HostClipboard {
  private pending?: Promise<string>
  restore = true

  get isPolling(): boolean {
    return this.pending !== undefined
  }

  /**
   * Snapshots the clipboard, then polls for item text. Await `ready` before sending the copy
   * keystroke so the snapshot is taken first.
   */
  readItemText(): { ready: Promise<void>; text: Promise<string> } {
    if (this.pending) return { ready: Promise.resolve(), text: this.pending }

    let markReady!: () => void
    const ready = new Promise<void>((r) => (markReady = r))
    this.pending = this.poll(markReady).finally(() => (this.pending = undefined))
    return { ready, text: this.pending }
  }

  private async poll(markReady: () => void): Promise<string> {
    let textBefore = await clipboard.readText()
    if (isPoeItemText(textBefore)) {
      // Clear old item text so a stale copy is never mistaken for the new one.
      textBefore = ''
      await clipboard.writeText('')
    }
    markReady()

    for (let elapsed = 0; elapsed < POLL_LIMIT; elapsed += POLL_DELAY) {
      await sleep(POLL_DELAY)
      const textAfter = await clipboard.readText()
      if (isPoeItemText(textAfter)) {
        if (this.restore) await clipboard.writeText(textBefore)
        return textAfter
      }
    }
    if (this.restore) await clipboard.writeText(textBefore)
    throw new ClipboardTimeoutError()
  }
}
