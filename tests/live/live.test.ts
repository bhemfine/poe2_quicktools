/**
 * Manual live contract check (`npm run check:live`). One request per endpoint, through the real
 * rate limiter, with the QuickTools User-Agent. Skipped in normal test runs and CI.
 */
import { describe, expect, it } from 'vitest'
import seeds from '../../config/trade-rate-limits.json'
import { RateLimiter } from '../../src/shared/ratelimit/limiter'
import {
  ninjaExchangeSchema,
  ninjaIndexStateSchema,
  parseOrThrow,
  tradeFetchSchema,
  tradeFiltersSchema,
  tradeItemsSchema,
  tradeLeaguesSchema,
  tradeSearchSchema,
  tradeStaticSchema,
  tradeStatsSchema,
} from '../../src/shared/schemas'
import { resolveLeague } from '../../src/shared/league'
import { USER_AGENT } from '../../src/main/net/http'

const TRADE = 'https://www.pathofexile.com/api/trade2'
const NINJA = 'https://poe.ninja/poe2/api'
const limiter = new RateLimiter(seeds)

async function get(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  })
  return {
    status: res.status,
    header: (n: string) => res.headers.get(n),
    body: (await res.json()) as unknown,
  }
}

describe.skipIf(!process.env.RUN_LIVE)('live endpoints', () => {
  let league = ''

  it('trade2 data endpoints match the schemas', async () => {
    const leagues = parseOrThrow(
      tradeLeaguesSchema,
      (await get(`${TRADE}/data/leagues`)).body,
      'leagues',
    )
    const info = resolveLeague(leagues, null)
    league = info.league ?? info.candidates[0]
    expect(league).toBeTruthy()
    parseOrThrow(tradeStatsSchema, (await get(`${TRADE}/data/stats`)).body, 'stats')
    parseOrThrow(tradeItemsSchema, (await get(`${TRADE}/data/items`)).body, 'items')
    parseOrThrow(tradeFiltersSchema, (await get(`${TRADE}/data/filters`)).body, 'filters')
    parseOrThrow(tradeStaticSchema, (await get(`${TRADE}/data/static`)).body, 'static')
  }, 60_000)

  it('one search and one fetch, no 429', async () => {
    const query = {
      query: { status: { option: 'online' }, type: 'Waystone (Tier 15)' },
      sort: { price: 'asc' },
    }
    const s = await limiter.run('trade-search-request-limit', () =>
      get(`${TRADE}/search/poe2/${encodeURIComponent(league)}`, {
        method: 'POST',
        body: JSON.stringify(query),
      }),
    )
    expect(s.status).toBe(200)
    console.log(
      'search policy:',
      s.header('x-rate-limit-policy'),
      s.header('x-rate-limit-ip'),
      s.header('x-rate-limit-ip-state'),
    )
    const search = parseOrThrow(tradeSearchSchema, s.body, 'search')
    if (!search.result.length) return
    const f = await limiter.run('trade-fetch-request-limit', () =>
      get(`${TRADE}/fetch/${search.result.slice(0, 10).join(',')}?query=${search.id}`),
    )
    expect(f.status).toBe(200)
    console.log(
      'fetch policy:',
      f.header('x-rate-limit-policy'),
      f.header('x-rate-limit-ip'),
      f.header('x-rate-limit-ip-state'),
    )
    parseOrThrow(tradeFetchSchema, f.body, 'fetch')
  }, 60_000)

  it('poe.ninja index and currency overview', async () => {
    parseOrThrow(
      ninjaIndexStateSchema,
      (await get(`${NINJA}/data/index-state`)).body,
      'index-state',
    )
    const cur = parseOrThrow(
      ninjaExchangeSchema,
      (
        await get(
          `${NINJA}/economy/exchange/current/overview?league=${encodeURIComponent(league)}&type=Currency`,
        )
      ).body,
      'Currency',
    )
    expect(cur.lines.length).toBeGreaterThan(0)
  }, 60_000)
})
