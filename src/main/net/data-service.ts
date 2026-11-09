import { EventEmitter } from 'node:events'
import type { ApiError, ApiResult } from '../../shared/api-result'
import { PatchHealth, type CheckReport } from '../../shared/health'
import type { DataStatus } from '../../shared/ipc'
import { resolveLeague, type LeagueInfo } from '../../shared/league'
import type { NinjaSnapshot } from '../../shared/pricing/ninja'
import type { NinjaTypes } from '../../shared/remote-config'
import {
  BusyError,
  CancelledError,
  RateLimitedError,
  type LimiterStorage,
  type PolicySnapshot,
} from '../../shared/ratelimit/limiter'
import { SchemaError, type TradeFetchResult, type TradeSearchResult } from '../../shared/schemas'
import type { TradeData } from '../../shared/trade-data'
import type { Logger } from '../logging/logger'
import { DiskCache } from './disk-cache'
import { HttpError, type HttpClient } from './http'
import { NinjaApi } from './ninja/ninja-api'
import { InvalidLeagueError, TradeApi } from './trade/trade-api'

const NINJA_REFRESH_MS = 15 * 60 * 1000
const TRADE_RETRY_MS = 2 * 60 * 1000
const NINJA_CACHE_MAX_AGE = 6 * 60 * 60 * 1000
// Patch detection: GGG's trade data is re-checked in the background so new or reworded mods are
// picked up within minutes of a patch instead of after the 24 h cache expires.
const TRADE_RECHECK_MS = 3 * 60 * 60 * 1000
const TRADE_STARTUP_RECHECK_AGE = 60 * 60 * 1000
const TRADE_STARTUP_RECHECK_DELAY_MS = 10_000
/** Unrecognised mods trigger a re-check, but not when the data is newer than this. */
const TRADE_UNKNOWN_MODS_RECHECK_AGE = 15 * 60 * 1000

interface DataEvents {
  status: [DataStatus]
  trade: [TradeData]
  ninja: [NinjaSnapshot]
  league: [LeagueInfo]
  ratelimit: [PolicySnapshot[]]
  /** Trade data changed while running (a patch); the message is for the user. */
  updated: [string]
  /** A new patch-health warning appeared. */
  health: [string]
}

/** Owns all network data: trade2 data, poe.ninja snapshot, league resolution, search/fetch. */
export class DataService extends EventEmitter<DataEvents> {
  private trade: TradeData | null = null
  private ninja: NinjaSnapshot | null = null
  private leagueInfo: LeagueInfo | null = null
  private status: DataStatus = { trade: 'loading', ninja: 'idle', ninjaErrors: {} }
  private ninjaTimer?: NodeJS.Timeout
  private tradeTimer?: NodeJS.Timeout
  private startupRecheck?: NodeJS.Timeout
  private ninjaLoading?: Promise<void>
  private tradeLoading?: Promise<void>
  private health = new PatchHealth()
  readonly tradeApi: TradeApi
  private ninjaApi: NinjaApi

  constructor(
    http: HttpClient,
    private cache: DiskCache,
    limiterStorage: LimiterStorage,
    private logger: Logger,
    private getSavedLeague: () => string | null,
    getNinjaTypes: () => NinjaTypes,
  ) {
    super()
    this.tradeApi = new TradeApi(http, cache, limiterStorage, (s) => this.emit('ratelimit', s))
    this.ninjaApi = new NinjaApi(http, undefined, getNinjaTypes)
  }

  async start(): Promise<void> {
    const cachedNinja = this.cache.get<NinjaSnapshot>('ninja-snapshot', NINJA_CACHE_MAX_AGE)
    if (cachedNinja) this.setNinja(cachedNinja.data)
    await this.loadTrade(false)
    if (Date.now() - this.tradeApi.dataFetchedAt > TRADE_STARTUP_RECHECK_AGE) {
      this.startupRecheck = setTimeout(
        () => void this.loadTrade(true, 'startup check'),
        TRADE_STARTUP_RECHECK_DELAY_MS,
      )
    }
    this.tradeTimer = setInterval(
      () => void this.loadTrade(true, 'scheduled check'),
      TRADE_RECHECK_MS,
    )
  }

  stop(): void {
    clearInterval(this.ninjaTimer)
    clearInterval(this.tradeTimer)
    clearTimeout(this.startupRecheck)
  }

  getTrade(): TradeData | null {
    return this.trade
  }
  getNinja(): NinjaSnapshot | null {
    return this.ninja
  }
  getLeague(): LeagueInfo | null {
    return this.leagueInfo
  }
  getStatus(): DataStatus {
    return { ...this.status }
  }
  rateLimits(): PolicySnapshot[] {
    return this.tradeApi.limiter.snapshot()
  }

  /** Re-resolves the league after the saved setting changed. */
  onSavedLeagueChanged(): void {
    if (!this.trade) return
    this.applyLeague(resolveLeague(this.trade.leagues, this.getSavedLeague()))
  }

  async refresh(): Promise<void> {
    await this.loadTrade(true)
  }

  /** The online poe.ninja type list changed: reload prices with it. */
  onNinjaTypesChanged(): void {
    if (this.leagueInfo?.league) void this.loadNinja()
  }

  /** One price check's parse/match result, for patch detection and the health warning. */
  reportCheck(report: CheckReport): void {
    this.health.record(report)
    if (report.unmatched.length) {
      this.logger.info('health', `unrecognised mod lines: ${JSON.stringify(report.unmatched)}`)
      // New or reworded mods usually mean a patch: fetch GGG's current stat list.
      if (Date.now() - this.tradeApi.dataFetchedAt > TRADE_UNKNOWN_MODS_RECHECK_AGE) {
        void this.loadTrade(true, 'unrecognised mods')
      }
    }
    this.updateHealth()
  }

  async search(query: unknown, group: string): Promise<ApiResult<TradeSearchResult>> {
    const league = this.leagueInfo?.league
    if (!league) return { ok: false, error: { kind: 'no-league', message: 'Pick a league first.' } }
    this.tradeApi.limiter.cancelGroup(group)
    try {
      return { ok: true, data: await this.tradeApi.search(league, query, group) }
    } catch (e) {
      if (e instanceof InvalidLeagueError) void this.loadTrade(true)
      return { ok: false, error: this.toApiError(e) }
    }
  }

  async fetch(ids: string[], queryId: string, group: string): Promise<ApiResult<TradeFetchResult>> {
    try {
      return { ok: true, data: await this.tradeApi.fetch(ids, queryId, group) }
    } catch (e) {
      return { ok: false, error: this.toApiError(e) }
    }
  }

  private loadTrade(force: boolean, recheckReason?: string): Promise<void> {
    if (!this.tradeLoading) {
      this.tradeLoading = this.doLoadTrade(force, recheckReason).finally(
        () => (this.tradeLoading = undefined),
      )
    }
    return this.tradeLoading
  }

  /** A re-check runs in the background: no "loading" state, and a failure keeps the data in use. */
  private async doLoadTrade(force: boolean, recheckReason?: string): Promise<void> {
    const background = recheckReason !== undefined && this.trade !== null
    if (!background) this.setStatus({ trade: 'loading', tradeError: undefined })
    try {
      const data = await this.tradeApi.loadData(force)
      const previous = this.trade?.version
      this.trade = data
      this.setStatus({
        trade: 'ready',
        tradeError: undefined,
        tradeFetchedAt: this.tradeApi.dataFetchedAt,
      })
      if (data.version !== previous) {
        this.logger.info(
          'data',
          `trade data version ${data.version}${recheckReason ? ` (${recheckReason})` : ''}`,
        )
        this.health.reset()
        this.updateHealth()
        this.emit('trade', data)
        if (previous) this.emit('updated', 'Game data updated: new or changed mods were loaded.')
      }
      this.applyLeague(resolveLeague(data.leagues, this.getSavedLeague()))
    } catch (e) {
      if (background) {
        this.logger.warn(
          'data',
          `trade data re-check failed (${recheckReason}): ${errorMessage(e)}`,
        )
        return
      }
      this.logger.error('data', 'trade data load failed', e)
      this.setStatus({ trade: 'error', tradeError: errorMessage(e) })
      setTimeout(() => void this.loadTrade(false), TRADE_RETRY_MS)
    }
  }

  private updateHealth(): void {
    const warning = this.health.warning() ?? undefined
    if (warning === this.status.health) return
    // The text carries counts and changes with every check; announce only the first one.
    if (warning && !this.status.health) {
      this.logger.warn('health', warning)
      this.emit('health', warning)
    }
    this.setStatus({ health: warning })
  }

  private applyLeague(info: LeagueInfo): void {
    const prev = this.leagueInfo?.league
    this.leagueInfo = info
    this.emit('league', info)
    if (info.league && info.league !== prev) {
      this.logger.info('data', `league: ${info.league}`)
      void this.loadNinja()
      clearInterval(this.ninjaTimer)
      this.ninjaTimer = setInterval(() => void this.loadNinja(), NINJA_REFRESH_MS)
    }
  }

  private loadNinja(): Promise<void> {
    if (this.ninjaLoading) return this.ninjaLoading
    const league = this.leagueInfo?.league
    if (!league) return Promise.resolve()
    this.setStatus({ ninja: 'loading' })
    this.ninjaLoading = (async () => {
      try {
        const snap = await this.ninjaApi.loadAll(league, this.ninja)
        const failed = Object.keys(snap.errors)
        if (failed.length) this.logger.warn('ninja', `failed types: ${JSON.stringify(snap.errors)}`)
        const anyData = Object.keys(snap.exchange).length + Object.keys(snap.uniques).length > 0
        if (anyData) {
          this.setNinja(snap)
          this.cache.set('ninja-snapshot', snap)
        }
        this.setStatus({
          ninja: anyData ? 'ready' : 'error',
          ninjaUpdatedAt: anyData ? snap.fetchedAt : this.status.ninjaUpdatedAt,
          ninjaErrors: snap.errors,
        })
      } catch (e) {
        this.logger.error('ninja', 'refresh failed', e)
        this.setStatus({ ninja: 'error', ninjaErrors: { all: errorMessage(e) } })
      } finally {
        this.ninjaLoading = undefined
      }
    })()
    return this.ninjaLoading
  }

  private setNinja(snap: NinjaSnapshot): void {
    this.ninja = snap
    this.status.ninjaUpdatedAt = snap.fetchedAt
    this.emit('ninja', snap)
  }

  private setStatus(patch: Partial<DataStatus>): void {
    this.status = { ...this.status, ...patch }
    this.emit('status', this.getStatus())
  }

  private toApiError(e: unknown): ApiError {
    if (e instanceof BusyError) return { kind: 'busy', message: 'Busy – try again in a moment.' }
    if (e instanceof CancelledError) return { kind: 'cancelled', message: e.message }
    if (e instanceof RateLimitedError) {
      return { kind: 'rate-limited', message: 'Rate limit reached – waiting.', until: e.until }
    }
    if (e instanceof InvalidLeagueError) return { kind: 'invalid-league', message: e.message }
    if (e instanceof SchemaError) {
      this.logger.error('trade', e.message)
      this.health.recordSchemaError()
      this.updateHealth()
      return { kind: 'schema', message: 'Trade response changed format – price unavailable.' }
    }
    if (e instanceof HttpError) return { kind: 'http', message: e.message }
    this.logger.error('trade', 'request failed', e)
    return { kind: 'network', message: errorMessage(e) }
  }
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
