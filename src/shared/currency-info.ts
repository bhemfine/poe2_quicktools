import type { TradeStatic } from './schemas'

/** GGG's image CDN; trade2 /data/static gives icon paths relative to it. */
export const ICON_HOST = 'https://web.poecdn.com'

export interface CurrencyInfo {
  name: string
  icon?: string
}

/**
 * Trade currency id ("divine", "exalted"…) → full name and icon URL, from trade2 /data/static.
 * Covers every currency a listing can be priced in, so nothing is hardcoded.
 */
export function buildCurrencyInfo(data: TradeStatic): Map<string, CurrencyInfo> {
  const out = new Map<string, CurrencyInfo>()
  for (const group of data.result) {
    for (const e of group.entries) {
      if (out.has(e.id)) continue
      out.set(e.id, { name: e.text, icon: e.image ? new URL(e.image, ICON_HOST).href : undefined })
    }
  }
  return out
}
