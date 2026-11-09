import seeds from '../../../../config/trade-rate-limits.json'
import {
  RateLimiter,
  type LimiterStorage,
  type PolicySnapshot,
} from '../../../shared/ratelimit/limiter'
import {
  parseOrThrow,
  tradeFetchSchema,
  tradeFiltersSchema,
  tradeItemsSchema,
  tradeLeaguesSchema,
  tradeSearchSchema,
  tradeStaticSchema,
  tradeStatsSchema,
  type TradeFetchResult,
  type TradeSearchResult,
} from '../../../shared/schemas'
import type { TradeData } from '../../../shared/trade-data'
import { DiskCache, hashOf } from '../disk-cache'
import { HttpError, type HttpClient, type HttpResponse } from '../http'

const BASE = 'https://www.pathofexile.com/api/trade2'
const DATA_TTL = 24 * 60 * 60 * 1000
const RESULT_TTL = 60 * 1000
const SEARCH = 'trade-search-request-limit'
const FETCH = 'trade-fetch-request-limit'

export class InvalidLeagueError extends Error {}

/**
 * trade2 data, search and fetch. Search and fetch go through the zero-429 limiter; data endpoints
 * are fetched once a day (or when forced) and cached on disk.
 */
export class TradeApi {
  readonly limiter: RateLimiter
  /** When the oldest part of the last loaded trade data was downloaded. */
  dataFetchedAt = 0
  private searchCache = new Map<string, { at: number; value: TradeSearchResult }>()
  private fetchCache = new Map<
    string,
    { at: number; value: NonNullable<TradeFetchResult['result'][number]> }
  >()

  constructor(
    private http: HttpClient,
    private cache: DiskCache,
    storage: LimiterStorage,
    onLimiterChange: (s: PolicySnapshot[]) => void,
  ) {
    this.limiter = new RateLimiter(seeds, storage, { onChange: onLimiterChange })
  }

  /** Loads leagues, stats, items, filters and static (disk cache first unless `force`). */
  async loadData(force = false): Promise<TradeData> {
    let oldest = Date.now()
    const get = async <T>(
      name: string,
      schema: Parameters<typeof parseOrThrow<T>>[0],
    ): Promise<T> => {
      const key = `trade-${name}`
      const cached = force ? null : this.cache.get<T>(key, DATA_TTL)
      if (cached) {
        oldest = Math.min(oldest, cached.fetchedAt)
        return cached.data
      }
      try {
        const res = await this.http.request<unknown>('GET', `${BASE}/data/${name}`)
        if (res.status !== 200)
          throw new HttpError(res.status, name, `trade data ${name}: HTTP ${res.status}`)
        const data = parseOrThrow(schema, res.body, `trade2 /data/${name}`)
        this.cache.set(key, data)
        return data
      } catch (e) {
        const stale = this.cache.getStale<T>(key)
        if (!stale) throw e
        oldest = Math.min(oldest, stale.fetchedAt)
        return stale.data
      }
    }
    const leagues = await get('leagues', tradeLeaguesSchema)
    const stats = await get('stats', tradeStatsSchema)
    const items = await get('items', tradeItemsSchema)
    const filters = await get('filters', tradeFiltersSchema)
    const staticData = await get('static', tradeStaticSchema)
    this.dataFetchedAt = oldest
    return {
      leagues,
      stats,
      items,
      filters,
      static: staticData,
      // Changes whenever GGG changes stat ids or texts; the renderer rebuilds its indexes on change.
      version: hashOf([stats, items, filters]),
    }
  }

  async search(league: string, query: unknown, group?: string): Promise<TradeSearchResult> {
    const key = JSON.stringify([league, query])
    const hit = this.searchCache.get(key)
    if (hit && Date.now() - hit.at < RESULT_TTL) return hit.value

    const res = await this.limiter.run(
      SEARCH,
      () => this.http.request('POST', `${BASE}/search/poe2/${encodeURIComponent(league)}`, query),
      group,
    )
    this.assertOk(res, 'search')
    const value = parseOrThrow(tradeSearchSchema, res.body, 'trade2 search')
    this.searchCache.set(key, { at: Date.now(), value })
    return value
  }

  /** Fetches up to 10 listings. Cached per item id for 60 s. */
  async fetch(ids: string[], queryId: string, group?: string): Promise<TradeFetchResult> {
    const now = Date.now()
    const missing = ids.slice(0, 10).filter((id) => {
      const c = this.fetchCache.get(id)
      return !c || now - c.at >= RESULT_TTL
    })
    if (missing.length) {
      const res = await this.limiter.run(
        FETCH,
        () =>
          this.http.request(
            'GET',
            `${BASE}/fetch/${missing.join(',')}?query=${encodeURIComponent(queryId)}`,
          ),
        group,
      )
      this.assertOk(res, 'fetch')
      const value = parseOrThrow(tradeFetchSchema, res.body, 'trade2 fetch')
      for (const r of value.result) if (r) this.fetchCache.set(r.id, { at: Date.now(), value: r })
    }
    return {
      result: ids.slice(0, 10).map((id) => this.fetchCache.get(id)?.value ?? null),
    }
  }

  private assertOk(res: HttpResponse, what: string): void {
    if (res.status === 200) return
    const msg = (res.body as { error?: { message?: string } } | null)?.error?.message ?? ''
    if (res.status === 400 && /league/i.test(msg)) throw new InvalidLeagueError(msg)
    throw new HttpError(
      res.status,
      what,
      `Trade ${what} failed: HTTP ${res.status}${msg ? ` – ${msg}` : ''}`,
    )
  }
}
