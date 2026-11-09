import { z } from 'zod'
import { DEFAULT_HOTKEYS, HOTKEY_ACTIONS, type HotkeyBindings } from './hotkeys/actions'
import { normalizeCombo } from './hotkeys/keys'

export const SETTINGS_VERSION = 1

export const CURRENCIES = ['divine', 'exalted', 'chaos', 'vaal'] as const
export type CurrencyId = (typeof CURRENCIES)[number]

const hotkeysSchema = z
  .record(z.string(), z.string())
  .catch({})
  .transform((raw): HotkeyBindings => {
    const out = { ...DEFAULT_HOTKEYS }
    for (const action of HOTKEY_ACTIONS) {
      if (typeof raw[action] !== 'string') continue
      // '' is a deliberate "unbound"; an invalid string falls back to the default.
      out[action] = raw[action] === '' ? '' : normalizeCombo(raw[action]) || DEFAULT_HOTKEYS[action]
    }
    return out
  })

const gameBindSchema = z.object({
  combo: z.string(),
  action: z.string(),
  wasd: z.boolean().optional(),
})

const pairSchema = z.object({ from: z.string(), to: z.string() })

export const settingsSchema = z.object({
  schemaVersion: z.literal(SETTINGS_VERSION).catch(SETTINGS_VERSION),
  hotkeys: hotkeysSchema,
  /** PoE 2's "Show Advanced Item Descriptions" key, merged into the copy keystroke. */
  advancedDescriptionsKey: z.string().catch('Alt'),
  restoreClipboard: z.boolean().catch(true),
  league: z.string().nullable().catch(null),
  uiScale: z.number().min(75).max(150).catch(100),
  currencyOrder: z
    .array(z.enum(CURRENCIES))
    .length(4)
    .catch([...CURRENCIES]),
  priceCheck: z
    .object({
      /** Default min for a numeric filter = value minus this percent of the value. */
      minRollPercent: z.number().min(0).max(100).catch(10),
      onlineOnly: z.boolean().catch(true),
    })
    .catch({ minRollPercent: 10, onlineOnly: true }),
  favouritePairs: z.array(pairSchema).catch([
    { from: 'divine', to: 'exalted' },
    { from: 'exalted', to: 'chaos' },
  ]),
  /** Stat ids the user flagged as high-value on tablets. */
  jackpotMods: z.array(z.string()).catch([]),
  wasdMode: z.boolean().catch(false),
  customGameBinds: z.array(gameBindSchema).catch([]),
  devTools: z.boolean().catch(false),
  checkForUpdates: z.boolean().catch(true),
})

export type Settings = z.infer<typeof settingsSchema>
export type SettingsPatch = Partial<Omit<Settings, 'schemaVersion'>>

export function defaultSettings(): Settings {
  return settingsSchema.parse({})
}

/**
 * Turns whatever is on disk (older version, partial, hand-edited, corrupt) into current settings.
 * Valid user values are kept; anything missing or invalid falls back to its default.
 */
export function migrateSettings(raw: unknown): Settings {
  const input = (
    raw && typeof raw === 'object' ? { ...(raw as Record<string, unknown>) } : {}
  ) as Record<string, unknown>
  const version = typeof input.schemaVersion === 'number' ? input.schemaVersion : 0

  if (version < 1) {
    // v0 = the M1 hand-edited file: `{ "hotkeys": [{ "action": "...", "combo": "..." }] }`.
    if (Array.isArray(input.hotkeys)) {
      input.hotkeys = Object.fromEntries(
        (input.hotkeys as Array<{ action?: unknown; combo?: unknown }>)
          .filter((h) => typeof h.action === 'string' && typeof h.combo === 'string')
          .map((h) => [h.action, h.combo]),
      )
    }
  }
  input.schemaVersion = SETTINGS_VERSION
  return settingsSchema.parse(input)
}

export function applySettingsPatch(current: Settings, patch: SettingsPatch): Settings {
  return migrateSettings({ ...current, ...patch })
}
