import { describe, expect, it } from 'vitest'
import { DEFAULT_HOTKEYS } from '../../src/shared/hotkeys/actions'
import { validateHotkey } from '../../src/shared/hotkeys/conflicts'
import { planCopyKeystroke } from '../../src/shared/hotkeys/copy-plan'
import {
  comboFromKeyboardEvent,
  displayCombo,
  normalizeCombo,
  toAccelerator,
} from '../../src/shared/hotkeys/keys'
import gameBinds from '../../config/poe2-default-binds.json'

const opts = { gameBinds: gameBinds.binds, wasdMode: false }

describe('combo parsing', () => {
  it('normalizes order, case and spacing', () => {
    expect(normalizeCombo('shift+ctrl+d')).toBe('Ctrl + Shift + D')
    expect(normalizeCombo('Alt + F4')).toBe('Alt + F4')
    expect(normalizeCombo('ctrl + ;')).toBe('Ctrl + Semicolon')
    expect(normalizeCombo('esc')).toBe('Escape')
  })

  it('rejects modifier-only and double main keys', () => {
    expect(normalizeCombo('Ctrl + Shift')).toBe('')
    expect(normalizeCombo('A + B')).toBe('')
    expect(normalizeCombo('')).toBe('')
  })

  it('maps to Electron accelerators', () => {
    expect(toAccelerator('Ctrl + Shift + D')).toBe('Ctrl+Shift+D')
    expect(toAccelerator('Enter')).toBe('Return')
    expect(toAccelerator('Ctrl + Numpad5')).toBe('Ctrl+num5')
    expect(toAccelerator('Ctrl + Semicolon')).toBe('Ctrl+;')
    expect(toAccelerator('Alt + ArrowUp')).toBe('Alt+Up')
  })

  it('reads keyboard events for the recorder', () => {
    expect(
      comboFromKeyboardEvent({ code: 'KeyD', ctrlKey: true, shiftKey: false, altKey: false }),
    ).toBe('Ctrl + D')
    expect(
      comboFromKeyboardEvent({ code: 'ShiftLeft', ctrlKey: false, shiftKey: true, altKey: false }),
    ).toBeNull()
    expect(
      comboFromKeyboardEvent({ code: 'Digit1', ctrlKey: false, shiftKey: false, altKey: true }),
    ).toBe('Alt + 1')
  })

  it('displays punctuation as characters', () => {
    expect(displayCombo('Ctrl + Quote')).toBe("Ctrl + '")
  })
})

describe('conflict detection', () => {
  it('errors on duplicates inside the app', () => {
    const issues = validateHotkey('pin-card', 'Ctrl + D', DEFAULT_HOTKEYS, opts)
    expect(issues).toContainEqual(expect.objectContaining({ level: 'error', code: 'duplicate' }))
  })

  it('warns on PoE 2 default binds and names the action', () => {
    const issues = validateHotkey('pin-card', 'Ctrl + Q', DEFAULT_HOTKEYS, opts)
    const bind = issues.find((i) => i.code === 'game-bind')
    expect(bind?.level).toBe('warning')
    expect(bind?.message).toContain('Secondary skill slot Q')
  })

  it('only flags WASD keys in WASD mode', () => {
    expect(validateHotkey('pin-card', 'Alt + A', DEFAULT_HOTKEYS, opts)).toEqual([])
    const bare = validateHotkey('pin-card', 'A', DEFAULT_HOTKEYS, { ...opts, wasdMode: true })
    expect(bare.map((i) => i.code)).toEqual(['game-bind', 'bare-key'])
  })

  it('warns on bare keys and blocks Windows-reserved combos', () => {
    expect(validateHotkey('converter-hud', 'F7', DEFAULT_HOTKEYS, opts)).toEqual([
      expect.objectContaining({ level: 'warning', code: 'bare-key' }),
    ])
    expect(validateHotkey('converter-hud', 'Alt + F4', DEFAULT_HOTKEYS, opts)).toContainEqual(
      expect.objectContaining({ level: 'error', code: 'windows-reserved' }),
    )
  })

  it('accepts user-added game binds', () => {
    const custom = {
      ...opts,
      gameBinds: [...opts.gameBinds, { combo: 'Ctrl + Y', action: 'My rebind' }],
    }
    expect(validateHotkey('pin-card', 'Ctrl + Y', DEFAULT_HOTKEYS, custom)[0].message).toContain(
      'My rebind',
    )
  })

  it('shipped defaults have no blocking errors', () => {
    for (const [action, combo] of Object.entries(DEFAULT_HOTKEYS)) {
      const issues = validateHotkey(
        action as keyof typeof DEFAULT_HOTKEYS,
        combo,
        DEFAULT_HOTKEYS,
        opts,
      )
      expect(
        issues.filter((i) => i.level === 'error'),
        action,
      ).toEqual([])
    }
  })
})

describe('copy keystroke plan (modifier merging)', () => {
  it('reuses held Ctrl and adds Alt for Ctrl + D', () => {
    expect(planCopyKeystroke('Ctrl + D', 'Alt')).toEqual({ release: ['D'], press: ['Alt'] })
  })

  it('releases unneeded held modifiers', () => {
    expect(planCopyKeystroke('Ctrl + Shift + D', 'Alt')).toEqual({
      release: ['D', 'Shift'],
      press: ['Alt'],
    })
  })

  it('presses both modifiers for a bare key', () => {
    expect(planCopyKeystroke('F5', 'Alt')).toEqual({ release: ['F5'], press: ['Ctrl', 'Alt'] })
  })

  it('reuses both when the hotkey already holds Ctrl + Alt', () => {
    expect(planCopyKeystroke('Ctrl + Alt + D', 'Alt')).toEqual({ release: ['D'], press: [] })
  })

  it('honours a rebound advanced-descriptions key', () => {
    expect(planCopyKeystroke('Ctrl + D', 'Shift')).toEqual({ release: ['D'], press: ['Shift'] })
    expect(planCopyKeystroke('Ctrl + D', 'Ctrl')).toEqual({ release: ['D'], press: [] })
  })
})
