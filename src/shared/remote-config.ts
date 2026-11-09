import { z } from 'zod'
import bundledBinds from '../../config/poe2-default-binds.json'
import bundledNinjaTypes from '../../config/ninja-types.json'
import type { GameBind } from './hotkeys/conflicts'
import { normalizeCombo } from './hotkeys/keys'

/**
 * Lists in `config/` that change with the game. Installed apps re-read them from the public repo,
 * so a fix pushed to `main` reaches everyone without a new release. A file that fails validation
 * is ignored and the last good copy (or the one built into the app) is kept.
 */
export const REMOTE_CONFIG_BASE =
  'https://raw.githubusercontent.com/bhemfine/poe2_quicktools/main/config'

// Types and slugs end up in poe.ninja URLs, so only plain identifiers are accepted.
const ninjaType = z.object({
  type: z.string().regex(/^[A-Za-z0-9]+$/),
  slug: z.string().regex(/^[a-z0-9-]+$/),
})
export const ninjaTypesSchema = z.object({
  exchange: z.array(ninjaType).min(1),
  uniques: z.array(ninjaType).min(1),
})

export const gameBindsSchema = z.object({
  binds: z
    .array(
      z.object({
        combo: z
          .string()
          .max(40)
          .refine((c) => normalizeCombo(c) !== '', 'not a key combination'),
        action: z.string().min(1).max(80),
        wasd: z.boolean().optional(),
      }),
    )
    .min(1),
})

export type NinjaTypes = z.infer<typeof ninjaTypesSchema>

export interface RemoteConfig {
  ninjaTypes: NinjaTypes
  gameBinds: GameBind[]
  /** "online" once at least one file came from the repo (now or in an earlier session). */
  source: 'built-in' | 'online'
  fetchedAt?: number
}

export const REMOTE_FILES = {
  ninjaTypes: { file: 'ninja-types.json', schema: ninjaTypesSchema },
  gameBinds: { file: 'poe2-default-binds.json', schema: gameBindsSchema },
} as const

export const BUNDLED_CONFIG: RemoteConfig = {
  ninjaTypes: ninjaTypesSchema.parse(bundledNinjaTypes),
  gameBinds: gameBindsSchema.parse(bundledBinds).binds,
  source: 'built-in',
}
