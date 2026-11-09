import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import seeds from '../../config/trade-rate-limits.json'
import {
  BusyError,
  CancelledError,
  RateLimitedError,
  RateLimiter,
  type LimiterStorage,
} from '../../src/shared/ratelimit/limiter'
import { parseRules, parseState, PolicyState } from '../../src/shared/ratelimit/policy'
import { MockTradeServer } from '../mock-server/trade-server'

const SEARCH = 'trade-search-request-limit'
const FETCH = 'trade-fetch-request-limit'

function memoryStorage(): LimiterStorage & { data: Record<string, number> } {
  return {
    data: {},
    load() {
      return { ...this.data }
    },
    save(d) {
      this.data = { ...d }
    },
  }
}

describe('rule parsing', () => {
  it('parses rules and state', () => {
    expect(parseRules('5:10:60,15:60:300')).toEqual([
      { limit: 5, period: 10, restrict: 60 },
      { limit: 15, period: 60, restrict: 300 },
    ])
    expect(parseState('1:10:0,1:60:0')).toEqual([
      { hits: 1, period: 10, restrictLeft: 0 },
      { hits: 1, period: 60, restrictLeft: 0 },
    ])
    expect(parseRules('garbage,,1:2')).toEqual([])
  })

  it('keeps one slot free in every window', () => {
    const p = new PolicyState('x', parseRules('5:10:60'))
    for (let i = 0; i < 4; i++) {
      expect(p.waitTime(1000 + i)).toBe(0)
      p.record(1000 + i)
    }
    // 4 used of 5: the 5th would fill the window, so wait until the oldest ages out.
    expect(p.waitTime(2000)).toBe(1000 + 10_000 - 2000 + 1)
  })

  it('reconciles with server state that counts more hits', () => {
    const p = new PolicyState('x', parseRules('5:10:60'))
    const headers: Record<string, string> = {
      'x-rate-limit-rules': 'Ip',
      'x-rate-limit-ip': '5:10:60',
      'x-rate-limit-ip-state': '4:10:0',
    }
    p.applyHeaders((n) => headers[n] ?? null, 5000)
    expect(p.used({ limit: 5, period: 10, restrict: 60 }, 5000)).toBe(4)
    expect(p.waitTime(5000)).toBeGreaterThan(0)
  })
})

describe('RateLimiter against a server enforcing the live rules', () => {
  beforeEach(() => vi.useFakeTimers({ now: 1_000_000 }))
  afterEach(() => vi.useRealTimers())

  it('20 price checks in 5 s send at most 5 searches and never get a 429', async () => {
    const server = new MockTradeServer(Date.now)
    const limiter = new RateLimiter(seeds, memoryStorage())
    const outcomes: string[] = []

    for (let check = 0; check < 20; check++) {
      const group = `check-${check}`
      limiter.cancelGroup(group)
      limiter
        .run(SEARCH, async () => server.handle(SEARCH, { id: group }), group)
        .then(
          () => outcomes.push('ok'),
          (e) =>
            outcomes.push(
              e instanceof CancelledError
                ? 'cancelled'
                : e instanceof BusyError
                  ? 'busy'
                  : 'limited',
            ),
        )
      await vi.advanceTimersByTimeAsync(250)
    }
    expect(server.sent[SEARCH]).toBeLessThanOrEqual(5)
    await vi.advanceTimersByTimeAsync(60_000)

    expect(server.count429).toBe(0)
    expect(server.sent[SEARCH]).toBeLessThanOrEqual(5)
    expect(outcomes).toHaveLength(20)
    expect(outcomes.filter((o) => o === 'ok').length).toBe(server.sent[SEARCH])
  })

  it('a burst of fetches stays under every window', async () => {
    const server = new MockTradeServer(Date.now)
    const limiter = new RateLimiter(seeds, undefined, { maxQueue: 100, maxWaitMs: 120_000 })
    const all = Array.from({ length: 30 }, () =>
      limiter.run(FETCH, async () => server.handle(FETCH, {})).catch(() => null),
    )
    await vi.advanceTimersByTimeAsync(200_000)
    await Promise.all(all)
    expect(server.count429).toBe(0)
    expect(server.sent[FETCH]).toBe(30)
  })

  it('an injected 429 blocks the policy until Retry-After, across a restart', async () => {
    const storage = memoryStorage()
    const server = new MockTradeServer(Date.now)
    server.force429[SEARCH] = { times: 1, retryAfter: 60 }
    const limiter = new RateLimiter(seeds, storage)

    await expect(limiter.run(SEARCH, async () => server.handle(SEARCH, {}))).rejects.toBeInstanceOf(
      RateLimitedError,
    )
    expect(server.sent[SEARCH]).toBe(1)
    expect(storage.data[SEARCH]).toBe(Date.now() + 60_000)

    // Same instance: no request reaches the server.
    await expect(limiter.run(SEARCH, async () => server.handle(SEARCH, {}))).rejects.toBeInstanceOf(
      RateLimitedError,
    )
    // "Restart": a new limiter reads the persisted lockout.
    await vi.advanceTimersByTimeAsync(30_000)
    const restarted = new RateLimiter(seeds, storage)
    await expect(
      restarted.run(SEARCH, async () => server.handle(SEARCH, {})),
    ).rejects.toBeInstanceOf(RateLimitedError)
    expect(server.sent[SEARCH]).toBe(1)

    // Other policies are unaffected.
    await expect(restarted.run(FETCH, async () => server.handle(FETCH, {}))).resolves.toMatchObject(
      {
        status: 200,
      },
    )

    await vi.advanceTimersByTimeAsync(31_000)
    await expect(
      restarted.run(SEARCH, async () => server.handle(SEARCH, {})),
    ).resolves.toMatchObject({
      status: 200,
    })
  })

  it('adopts tighter live headers immediately', async () => {
    const server = new MockTradeServer(Date.now)
    server.rules[SEARCH] = parseRules('3:10:60')
    const limiter = new RateLimiter(seeds, undefined, { maxQueue: 10, maxWaitMs: 60_000 })
    const runs = Array.from({ length: 6 }, () =>
      limiter.run(SEARCH, async () => server.handle(SEARCH, {})).catch(() => null),
    )
    await vi.advanceTimersByTimeAsync(60_000)
    await Promise.all(runs)
    expect(server.count429).toBe(0)
    const snap = limiter.snapshot().find((s) => s.policy === SEARCH)!
    expect(snap.windows[0]).toMatchObject({ limit: 3, period: 10 })
  })

  it('sends one request at a time for an unknown policy until headers arrive', async () => {
    let concurrent = 0
    let maxConcurrent = 0
    const limiter = new RateLimiter({})
    const send = async () => {
      concurrent++
      maxConcurrent = Math.max(maxConcurrent, concurrent)
      await new Promise((r) => setTimeout(r, 100))
      concurrent--
      return { status: 200, header: () => null, body: {} }
    }
    const runs = [limiter.run('new-policy', send), limiter.run('new-policy', send)]
    await vi.advanceTimersByTimeAsync(1000)
    await Promise.all(runs)
    expect(maxConcurrent).toBe(1)
  })

  it('returns busy immediately when the queue is full', async () => {
    const limiter = new RateLimiter({ p: '100:60:60' })
    const never = () => new Promise<never>(() => {})
    void limiter.run('p', never).catch(() => {})
    await vi.advanceTimersByTimeAsync(0)
    // First is in flight (no headers yet); the next three wait in the queue; the fifth is refused.
    const queued = [1, 2, 3].map(() => limiter.run('p', never).catch(() => 'x'))
    await expect(limiter.run('p', never)).rejects.toBeInstanceOf(BusyError)
    limiter.cancelGroup()
    expect(await Promise.all(queued)).toEqual(['x', 'x', 'x'])
  })
})
