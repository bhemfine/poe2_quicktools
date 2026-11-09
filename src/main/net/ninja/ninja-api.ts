import { ninjaLeagueSlug } from '../../../shared/league'
import type { NinjaSnapshot } from '../../../shared/pricing/ninja'
import { BUNDLED_CONFIG, type NinjaTypes } from '../../../shared/remote-config'
import {
  ninjaExchangeSchema,
  ninjaIndexStateSchema,
  ninjaItemOverviewSchema,
  parseOrThrow,
  type NinjaIndexState,
} from '../../../shared/schemas'
import { HttpError, type HttpClient } from '../http'

const BASE = 'https://poe.ninja/poe2/api'
/** Gap between requests so a refresh never bursts poe.ninja. */
const STAGGER_MS = 1200

export class EmptyResultError extends Error {}

/** poe.ninja (unofficial): one request per type, staggered, validated, "200 + 0 lines" = error. */
export class NinjaApi {
  private index: NinjaIndexState | null = null

  constructor(
    private http: HttpClient,
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    /** The type list may be updated online (see RemoteConfigService). */
    private getTypes: () => NinjaTypes = () => BUNDLED_CONFIG.ninjaTypes,
  ) {}

  async loadIndex(): Promise<NinjaIndexState> {
    const res = await this.http.request('GET', `${BASE}/data/index-state`)
    if (res.status !== 200)
      throw new HttpError(res.status, 'index-state', `poe.ninja index-state: HTTP ${res.status}`)
    this.index = parseOrThrow(ninjaIndexStateSchema, res.body, 'poe.ninja index-state')
    return this.index
  }

  /** Fetches every configured type for `league`. Failed types are reported, not thrown. */
  async loadAll(league: string, previous?: NinjaSnapshot | null): Promise<NinjaSnapshot> {
    if (!this.index) {
      try {
        await this.loadIndex()
      } catch {
        // The slug falls back to a derived value.
      }
    }
    const ninjaTypes = this.getTypes()
    const snap: NinjaSnapshot = {
      league,
      leagueSlug: ninjaLeagueSlug(this.index, league),
      fetchedAt: Date.now(),
      exchange: {},
      uniques: {},
      errors: {},
      slugs: Object.fromEntries(
        [...ninjaTypes.exchange, ...ninjaTypes.uniques].map((t) => [t.type, t.slug]),
      ),
    }
    const q = (type: string) => `league=${encodeURIComponent(league)}&type=${type}`

    let first = true
    for (const { type } of ninjaTypes.exchange) {
      if (!first) await this.sleep(STAGGER_MS)
      first = false
      try {
        const res = await this.http.request(
          'GET',
          `${BASE}/economy/exchange/current/overview?${q(type)}`,
        )
        if (res.status !== 200) throw new HttpError(res.status, type, `HTTP ${res.status}`)
        const data = parseOrThrow(ninjaExchangeSchema, res.body, `poe.ninja ${type}`)
        if (!data.lines.length)
          throw new EmptyResultError(`poe.ninja ${type}: no lines (invalid type or league)`)
        snap.exchange[type] = data
      } catch (e) {
        snap.errors[type] = errorMessage(e)
        if (previous?.league === league && previous.exchange[type])
          snap.exchange[type] = previous.exchange[type]
      }
    }
    for (const { type } of ninjaTypes.uniques) {
      await this.sleep(STAGGER_MS)
      try {
        const res = await this.http.request(
          'GET',
          `${BASE}/economy/stash/current/item/overview?${q(type)}`,
        )
        if (res.status !== 200) throw new HttpError(res.status, type, `HTTP ${res.status}`)
        const data = parseOrThrow(ninjaItemOverviewSchema, res.body, `poe.ninja ${type}`)
        if (!data.lines.length)
          throw new EmptyResultError(`poe.ninja ${type}: no lines (invalid type or league)`)
        snap.uniques[type] = data
      } catch (e) {
        snap.errors[type] = errorMessage(e)
        if (previous?.league === league && previous.uniques[type])
          snap.uniques[type] = previous.uniques[type]
      }
    }
    return snap
  }
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
