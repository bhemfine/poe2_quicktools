/**
 * Reads display settings from PoE 2's `poe2_production_Config.ini` (read-only; the game file is
 * never written). Used only to explain why the overlay cannot show in exclusive fullscreen.
 */
export interface GameDisplayConfig {
  fullscreen: boolean
  borderless: boolean
}

export function parseGameDisplayConfig(ini: string): GameDisplayConfig | null {
  let section = ''
  const values: Record<string, string> = {}
  for (const raw of ini.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith(';')) continue
    const header = /^\[(.+)\]$/.exec(line)
    if (header) {
      section = header[1].toUpperCase()
      continue
    }
    if (section !== 'DISPLAY') continue
    const eq = line.indexOf('=')
    if (eq > 0) values[line.slice(0, eq).trim().toLowerCase()] = line.slice(eq + 1).trim()
  }
  if (!('fullscreen' in values)) return null
  return {
    fullscreen: values.fullscreen === 'true',
    borderless: values.borderless_windowed_fullscreen === 'true',
  }
}

export function isExclusiveFullscreen(cfg: GameDisplayConfig | null): boolean {
  return Boolean(cfg?.fullscreen && !cfg.borderless)
}
