import { EventEmitter } from 'node:events'
import {
  BUNDLED_CONFIG,
  REMOTE_CONFIG_BASE,
  REMOTE_FILES,
  type RemoteConfig,
} from '../../shared/remote-config'
import type { Logger } from '../logging/logger'
import type { DiskCache } from './disk-cache'
import type { HttpClient } from './http'

const REFRESH_MS = 6 * 60 * 60 * 1000
const CACHE_KEY = 'remote-config'

type Key = keyof typeof REMOTE_FILES
type Values = Pick<RemoteConfig, Key>

/**
 * Keeps the game lists in `config/` current by re-reading them from the public repo at start and
 * every 6 h. Each file is validated on its own; a bad or missing file keeps the last good copy.
 */
export class RemoteConfigService extends EventEmitter<{ change: [RemoteConfig] }> {
  private config: RemoteConfig
  private timer?: NodeJS.Timeout

  constructor(
    private http: HttpClient,
    private cache: DiskCache,
    private logger: Logger,
  ) {
    super()
    this.config = this.fromCache() ?? BUNDLED_CONFIG
  }

  get(): RemoteConfig {
    return this.config
  }

  start(): void {
    void this.refresh()
    this.timer = setInterval(() => void this.refresh(), REFRESH_MS)
  }

  stop(): void {
    clearInterval(this.timer)
  }

  async refresh(): Promise<void> {
    const next: Values = { ninjaTypes: this.config.ninjaTypes, gameBinds: this.config.gameBinds }
    let fetched = 0
    await Promise.all(
      (Object.keys(REMOTE_FILES) as Key[]).map(async (key) => {
        const { file } = REMOTE_FILES[key]
        try {
          const res = await this.http.request('GET', `${REMOTE_CONFIG_BASE}/${file}`)
          if (res.status !== 200) throw new Error(`HTTP ${res.status}`)
          const value = parse(key, res.body)
          if (!value) throw new Error('failed validation')
          Object.assign(next, value)
          fetched++
        } catch (e) {
          this.logger.warn(
            'config',
            `online ${file} not used (${e instanceof Error ? e.message : String(e)})`,
          )
        }
      }),
    )
    if (!fetched) return
    const changed =
      JSON.stringify(next) !==
      JSON.stringify({ ninjaTypes: this.config.ninjaTypes, gameBinds: this.config.gameBinds })
    this.cache.set(CACHE_KEY, next)
    this.config = { ...next, source: 'online', fetchedAt: Date.now() }
    if (changed) this.logger.info('config', 'online game lists changed')
    this.emit('change', this.config)
  }

  private fromCache(): RemoteConfig | null {
    const entry = this.cache.getStale<Record<string, unknown>>(CACHE_KEY)
    if (!entry) return null
    const ninjaTypes = parse('ninjaTypes', entry.data['ninjaTypes'])?.ninjaTypes
    const gameBinds = parse('gameBinds', { binds: entry.data['gameBinds'] })?.gameBinds
    if (!ninjaTypes || !gameBinds) return null
    return { ninjaTypes, gameBinds, source: 'online', fetchedAt: entry.fetchedAt }
  }
}

/** Validates one file's JSON and maps it onto the RemoteConfig field it fills. */
function parse(key: Key, body: unknown): Partial<Values> | null {
  if (key === 'ninjaTypes') {
    const r = REMOTE_FILES.ninjaTypes.schema.safeParse(body)
    return r.success ? { ninjaTypes: r.data } : null
  }
  const r = REMOTE_FILES.gameBinds.schema.safeParse(body)
  return r.success ? { gameBinds: r.data.binds } : null
}
