import type { NinjaIndexState, TradeLeagues } from './schemas'

export interface LeagueInfo {
  /** League used for trade and poe.ninja, or null while the user still has to pick. */
  league: string | null
  /** Trade leagues that qualify for automatic selection (no HC/SSF/Standard/private). */
  candidates: string[]
  /** Every PoE 2 trade league, for the manual picker in Settings. */
  all: string[]
  needsPick: boolean
}

export function isCandidateLeague(id: string): boolean {
  if (id === 'Standard' || id === 'Hardcore') return false
  if (/^HC /i.test(id) || /hardcore/i.test(id)) return false
  if (/\bSSF\b/i.test(id) || /solo self-found/i.test(id)) return false
  if (/\(PL\d+\)/.test(id)) return false
  return true
}

/**
 * trade2 `/data/leagues` is the source of truth (PLAN §3.4). A saved league is kept while it still
 * exists; otherwise a single candidate is used, and several candidates mean the user picks once.
 */
export function resolveLeague(trade: TradeLeagues, saved: string | null): LeagueInfo {
  const all = trade.result.filter((l) => !l.realm || l.realm === 'poe2').map((l) => l.id)
  const candidates = all.filter(isCandidateLeague)
  if (saved && all.includes(saved)) return { league: saved, candidates, all, needsPick: false }
  if (candidates.length === 1) return { league: candidates[0], candidates, all, needsPick: false }
  if (candidates.length === 0) {
    const fallback = all.includes('Standard') ? 'Standard' : (all[0] ?? null)
    return { league: fallback, candidates, all, needsPick: false }
  }
  return { league: null, candidates, all, needsPick: true }
}

/** poe.ninja URL slug for a league name, e.g. "Runes of Aldur" → "runesofaldur". */
export function ninjaLeagueSlug(index: NinjaIndexState | null, league: string): string {
  const hit = index?.economyLeagues.find((l) => l.name === league)
  return hit?.url ?? league.toLowerCase().replace(/[^a-z0-9]/g, '')
}
