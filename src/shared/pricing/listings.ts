import type { TradeFetchResult } from '../schemas'
import type { PriceIndex } from './ninja'

export interface Listing {
  id: string
  amount?: number
  currency?: string
  /** Price converted to Divine via poe.ninja; undefined when the currency is unknown. */
  divine?: number
  online: boolean
  account: string
  whisper?: string
  indexed?: string
}

/** Turns trade2 fetch results into display rows, cheapest first by Divine value. */
export function toListings(res: TradeFetchResult, prices: PriceIndex | null): Listing[] {
  const rows: Listing[] = []
  for (const r of res.result) {
    if (!r) continue
    const p = r.listing.price ?? undefined
    rows.push({
      id: r.id,
      amount: p?.amount,
      currency: p?.currency,
      divine: p && prices ? prices.toDivine(p.amount, p.currency) : undefined,
      online: !!r.listing.account.online,
      account: r.listing.account.name,
      whisper: r.listing.whisper,
      indexed: r.listing.indexed,
    })
  }
  return rows.sort((a, b) => (a.divine ?? Infinity) - (b.divine ?? Infinity))
}

/**
 * PoE 2 keyword text (0.5.5): "For every 2% increased Effectiveness, Monsters gain 2% more
 * Toughness, 1% more Experience granted and 1% more quantity of items dropped."
 * Stacking across sources is unverified, so the UI labels these as approximate.
 */
export function effectivenessBreakdown(effectiveness: number): {
  toughness: number
  damageTakenFactor: number
  experience: number
  quantity: number
} {
  return {
    toughness: effectiveness,
    damageTakenFactor: 1 / (1 + effectiveness / 100),
    experience: effectiveness / 2,
    quantity: effectiveness / 2,
  }
}
