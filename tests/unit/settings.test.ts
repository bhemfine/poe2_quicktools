import { describe, expect, it } from 'vitest'
import { DEFAULT_HOTKEYS } from '../../src/shared/hotkeys/actions'
import {
  applySettingsPatch,
  defaultSettings,
  migrateSettings,
  SETTINGS_VERSION,
} from '../../src/shared/settings'
import { isExclusiveFullscreen, parseGameDisplayConfig } from '../../src/shared/game-config'

describe('settings migration', () => {
  it('fills every default for an empty or corrupt file', () => {
    expect(migrateSettings(undefined)).toEqual(defaultSettings())
    expect(migrateSettings('garbage')).toEqual(defaultSettings())
    expect(defaultSettings().hotkeys).toEqual(DEFAULT_HOTKEYS)
  })

  it('migrates the v0 (M1 hand-edited) hotkey list to the current schema', () => {
    const v0 = {
      hotkeys: [
        { action: 'price-check', combo: 'ctrl+shift+q' },
        { action: 'unknown-action', combo: 'F9' },
      ],
      restoreClipboard: false,
    }
    const s = migrateSettings(v0)
    expect(s.schemaVersion).toBe(SETTINGS_VERSION)
    expect(s.hotkeys['price-check']).toBe('Ctrl + Shift + Q')
    expect(s.hotkeys['converter-hud']).toBe(DEFAULT_HOTKEYS['converter-hud'])
    expect(s.restoreClipboard).toBe(false)
    expect(s.uiScale).toBe(100)
  })

  it('keeps valid values and replaces invalid ones', () => {
    const s = migrateSettings({
      schemaVersion: 1,
      uiScale: 500,
      league: 'Runes of Aldur',
      hotkeys: { 'pin-card': 'not a key', 'open-ninja': '' },
      currencyOrder: ['chaos', 'vaal', 'divine', 'exalted'],
    })
    expect(s.uiScale).toBe(100)
    expect(s.league).toBe('Runes of Aldur')
    expect(s.hotkeys['pin-card']).toBe(DEFAULT_HOTKEYS['pin-card'])
    expect(s.hotkeys['open-ninja']).toBe('')
    expect(s.currencyOrder).toEqual(['chaos', 'vaal', 'divine', 'exalted'])
  })

  it('applies patches through the same validation', () => {
    const s = applySettingsPatch(defaultSettings(), { uiScale: 125, wasdMode: true })
    expect(s.uiScale).toBe(125)
    expect(s.wasdMode).toBe(true)
  })
})

describe('PoE 2 display config', () => {
  const ini = (fullscreen: string, borderless: string) =>
    `﻿[GENERAL]\nfoo=1\n[DISPLAY]\nfullscreen=${fullscreen}\nborderless_windowed_fullscreen=${borderless}\n`

  it('detects exclusive fullscreen', () => {
    expect(isExclusiveFullscreen(parseGameDisplayConfig(ini('true', 'false')))).toBe(true)
  })

  it('treats windowed fullscreen and windowed as fine', () => {
    expect(isExclusiveFullscreen(parseGameDisplayConfig(ini('true', 'true')))).toBe(false)
    expect(isExclusiveFullscreen(parseGameDisplayConfig(ini('false', 'false')))).toBe(false)
  })

  it('returns null when the section is missing', () => {
    expect(parseGameDisplayConfig('[GENERAL]\nx=1')).toBeNull()
  })
})
