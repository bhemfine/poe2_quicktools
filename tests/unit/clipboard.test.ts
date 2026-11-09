import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const board = { text: '' }
vi.mock('electron', () => ({
  clipboard: {
    readText: async () => board.text,
    writeText: async (t: string) => {
      board.text = t
    },
  },
}))

const { HostClipboard, ClipboardTimeoutError } =
  await import('../../src/main/clipboard/HostClipboard')

const ITEM = 'Item Class: Rings\nRarity: Rare\nRune Loop\nPrismatic Ring'

describe('HostClipboard poll and restore', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('returns the item text and restores what the user had copied', async () => {
    board.text = 'copied from Notepad'
    const cb = new HostClipboard()
    const { ready, text } = cb.readItemText()
    await ready
    // The game writes the item 100 ms after the keystroke.
    setTimeout(() => (board.text = ITEM), 100)
    await vi.advanceTimersByTimeAsync(150)
    await expect(text).resolves.toBe(ITEM)
    expect(board.text).toBe('copied from Notepad')
  })

  it('does not restore when the setting is off', async () => {
    board.text = 'copied from Notepad'
    const cb = new HostClipboard()
    cb.restore = false
    const { ready, text } = cb.readItemText()
    await ready
    board.text = ITEM
    await vi.advanceTimersByTimeAsync(60)
    await text
    expect(board.text).toBe(ITEM)
  })

  it('clears stale item text so an old copy is not returned', async () => {
    board.text = ITEM
    const cb = new HostClipboard()
    const { ready, text } = cb.readItemText()
    await ready
    expect(board.text).toBe('')
    const fresh = ITEM.replace('Rune Loop', 'Doom Bite')
    setTimeout(() => (board.text = fresh), 50)
    await vi.advanceTimersByTimeAsync(100)
    await expect(text).resolves.toBe(fresh)
  })

  it('times out after 500 ms and still restores', async () => {
    board.text = 'keep me'
    const cb = new HostClipboard()
    const { text } = cb.readItemText()
    const assertion = expect(text).rejects.toBeInstanceOf(ClipboardTimeoutError)
    await vi.advanceTimersByTimeAsync(600)
    await assertion
    expect(board.text).toBe('keep me')
    expect(cb.isPolling).toBe(false)
  })

  it('shares one poll between overlapping presses', () => {
    const cb = new HostClipboard()
    expect(cb.readItemText().text).toBe(cb.readItemText().text)
  })
})
