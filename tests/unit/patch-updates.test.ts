import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { DataService } from '../../src/main/net/data-service'
import { DiskCache } from '../../src/main/net/disk-cache'
import type { HttpClient, HttpResponse } from '../../src/main/net/http'
import { RemoteConfigService } from '../../src/main/net/remote-config'
import type { Logger } from '../../src/main/logging/logger'
import { PatchHealth, toCheckReport, type CheckReport } from '../../src/shared/health'
import {
  BUNDLED_CONFIG,
  gameBindsSchema,
  ninjaTypesSchema,
  REMOTE_CONFIG_BASE,
} from '../../src/shared/remote-config'
import type { TradeStats } from '../../src/shared/schemas'
import { compareVersions } from '../../src/shared/version'
import { apiFixture } from '../helpers'

const logger = { debug() {}, info() {}, warn() {}, error() {} } as unknown as Logger
const tempCache = () => new DiskCache(mkdtempSync(join(tmpdir(), 'qt-test-')))
const ok = (body: unknown): HttpResponse => ({ status: 200, header: () => null, body })
const notFound: HttpResponse = { status: 404, header: () => null, body: null }

function fakeHttp(routes: (url: string) => HttpResponse): HttpClient & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    async request<T>(_m: 'GET' | 'POST', url: string) {
      calls.push(url)
      return routes(url) as HttpResponse<T>
    },
  }
}

const report = (modLines: number, unmatched: number, parserError = false): CheckReport => ({
  modLines,
  unmatched: Array.from({ length: unmatched }, (_, i) => `unknown mod ${i}`),
  parserError,
})

describe('patch health warning', () => {
  it('stays quiet for an odd item but warns when many mods are unrecognised', () => {
    const h = new PatchHealth()
    h.record(report(6, 3))
    expect(h.warning()).toBeNull() // too few lines to judge
    h.record(report(6, 0))
    h.record(report(6, 1))
    expect(h.warning()).toMatch(/4 of 18 item mods/)
  })

  it('does not warn when most mods are recognised', () => {
    const h = new PatchHealth()
    for (let i = 0; i < 10; i++) h.record(report(6, i === 0 ? 2 : 0))
    expect(h.warning()).toBeNull()
  })

  it('warns after repeated parser errors or trade format changes, and resets on new data', () => {
    const h = new PatchHealth()
    for (let i = 0; i < 3; i++) h.record(report(4, 0, true))
    expect(h.warning()).toMatch(/could not be read/)
    h.reset()
    expect(h.warning()).toBeNull()
    h.recordSchemaError()
    h.recordSchemaError()
    expect(h.warning()).toMatch(/trade site changed/)
  })

  it('sanitises reports from the renderer', () => {
    expect(toCheckReport(null)).toBeNull()
    expect(toCheckReport({ modLines: 'x', unmatched: [] })).toBeNull()
    const r = toCheckReport({ modLines: 1e6, unmatched: ['a'.repeat(500), 5], parserError: 1 })
    expect(r).toEqual({ modLines: 100, unmatched: ['a'.repeat(200)], parserError: false })
  })
})

describe('version compare', () => {
  it('orders versions numerically and ignores a leading v', () => {
    expect(compareVersions('v0.10.0', '0.9.9')).toBeGreaterThan(0)
    expect(compareVersions('0.1.0', 'v0.1.0')).toBe(0)
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0)
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
  })
})

describe('online game lists', () => {
  const onlineNinja = {
    exchange: [{ type: 'Currency', slug: 'currency' }],
    uniques: [{ type: 'UniqueWeapons', slug: 'unique-weapons' }],
  }
  const onlineBinds = { binds: [{ combo: 'Ctrl + K', action: 'New bind' }] }

  it('the files in config/ pass their own schemas', () => {
    expect(BUNDLED_CONFIG.ninjaTypes.exchange.length).toBeGreaterThan(5)
    expect(BUNDLED_CONFIG.gameBinds.length).toBeGreaterThan(5)
  })

  it('rejects types that could change the URL and binds that are not key combos', () => {
    const bad = { ...onlineNinja, exchange: [{ type: 'Currency&x=1', slug: 'currency' }] }
    expect(ninjaTypesSchema.safeParse(bad).success).toBe(false)
    expect(
      ninjaTypesSchema.safeParse({ ...onlineNinja, uniques: [{ type: 'A', slug: '../x' }] })
        .success,
    ).toBe(false)
    expect(gameBindsSchema.safeParse({ binds: [{ combo: '', action: 'x' }] }).success).toBe(false)
  })

  it('uses valid online files, remembers them, and keeps the old copy of a bad file', async () => {
    const cache = tempCache()
    const http = fakeHttp((url) => {
      if (url === `${REMOTE_CONFIG_BASE}/ninja-types.json`) return ok({ exchange: [] }) // invalid
      if (url === `${REMOTE_CONFIG_BASE}/poe2-default-binds.json`) return ok(onlineBinds)
      return notFound
    })
    const svc = new RemoteConfigService(http, cache, logger)
    const changes: unknown[] = []
    svc.on('change', (c) => changes.push(c))
    await svc.refresh()
    expect(changes).toHaveLength(1)
    expect(svc.get().source).toBe('online')
    expect(svc.get().gameBinds).toEqual(onlineBinds.binds)
    expect(svc.get().ninjaTypes).toEqual(BUNDLED_CONFIG.ninjaTypes)

    // Next start, offline: the remembered online copy is used.
    const offline = new RemoteConfigService(
      fakeHttp(() => notFound),
      cache,
      logger,
    )
    expect(offline.get().gameBinds).toEqual(onlineBinds.binds)
    await offline.refresh()
    expect(offline.get().source).toBe('online')
  })

  it('stays on the built-in copy when GitHub is unreachable', async () => {
    const svc = new RemoteConfigService(
      fakeHttp(() => {
        throw new Error('offline')
      }),
      tempCache(),
      logger,
    )
    const onChange = vi.fn()
    svc.on('change', onChange)
    await svc.refresh()
    expect(onChange).not.toHaveBeenCalled()
    expect(svc.get()).toBe(BUNDLED_CONFIG)
  })
})

describe('patch detection (trade data re-check)', () => {
  const tradeNames = ['leagues', 'stats', 'items', 'filters', 'static'] as const
  const fixture = (name: string) => apiFixture(`trade-${name}.json`)
  const patchedStats = () => {
    const stats = structuredClone(fixture('stats')) as TradeStats
    stats.result[0].entries.push({
      id: 'explicit.stat_new',
      text: 'New patch mod',
      type: 'explicit',
    })
    return stats
  }

  function setup(cacheAgeMs: number) {
    const cache = tempCache()
    for (const n of tradeNames) cache.set(`trade-${n}`, fixture(n), Date.now() - cacheAgeMs)
    const http = fakeHttp((url) => {
      const name = /\/data\/(\w+)$/.exec(url)?.[1]
      if (name === 'stats') return ok(patchedStats())
      return name ? ok(fixture(name)) : notFound
    })
    const svc = new DataService(
      http,
      cache,
      { load: () => ({}), save: () => {} },
      logger,
      () => null,
      () => BUNDLED_CONFIG.ninjaTypes,
    )
    return { svc, http }
  }

  it('fetches GGG data again when a price check finds unknown mods and the data is old', async () => {
    const { svc, http } = setup(2 * 60 * 60 * 1000)
    const updated = vi.fn()
    svc.on('updated', updated)
    await svc.start()
    expect(http.calls).toEqual([]) // served from the disk cache
    const before = svc.getTrade()!.version

    svc.reportCheck(report(5, 1))
    await vi.waitFor(() => expect(updated).toHaveBeenCalledOnce())
    expect(http.calls.some((u) => u.endsWith('/data/stats'))).toBe(true)
    expect(svc.getTrade()!.version).not.toBe(before)
    expect(svc.getStatus().trade).toBe('ready')
    svc.stop()
  })

  it('does not re-fetch for unknown mods when the data is only minutes old', async () => {
    const { svc, http } = setup(60 * 1000)
    await svc.start()
    svc.reportCheck(report(5, 2))
    await new Promise((r) => setTimeout(r, 20))
    expect(http.calls).toEqual([])
    svc.stop()
  })

  it('puts the health warning in the data status and announces it once', async () => {
    const { svc } = setup(60 * 1000)
    const health = vi.fn()
    svc.on('health', health)
    await svc.start()
    for (let i = 0; i < 4; i++) svc.reportCheck(report(5, 2))
    expect(svc.getStatus().health).toMatch(/not recognised/)
    expect(health).toHaveBeenCalledOnce()
    svc.stop()
  })
})
