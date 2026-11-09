import { describe, expect, it } from 'vitest'
import { isCandidateLeague, ninjaLeagueSlug, resolveLeague } from '../../src/shared/league'
import { PriceIndex, type NinjaSnapshot } from '../../src/shared/pricing/ninja'
import {
  ninjaExchangeSchema,
  ninjaIndexStateSchema,
  ninjaItemOverviewSchema,
  parseOrThrow,
  SchemaError,
  tradeFetchSchema,
  tradeFiltersSchema,
  tradeItemsSchema,
  tradeLeaguesSchema,
  tradeStaticSchema,
  tradeStatsSchema,
  type NinjaExchange,
  type NinjaIndexState,
  type NinjaItemOverview,
  type TradeLeagues,
} from '../../src/shared/schemas'
import { NinjaApi } from '../../src/main/net/ninja/ninja-api'
import type { HttpClient, HttpResponse } from '../../src/main/net/http'
import { apiFixture } from '../helpers'

describe('contract: recorded fixtures match the schemas', () => {
  it.each([
    ['trade-leagues.json', tradeLeaguesSchema],
    ['trade-stats.json', tradeStatsSchema],
    ['trade-items.json', tradeItemsSchema],
    ['trade-filters.json', tradeFiltersSchema],
    ['trade-static.json', tradeStaticSchema],
    ['ninja-index-state.json', ninjaIndexStateSchema],
    ['ninja-exchange-currency.json', ninjaExchangeSchema],
    ['ninja-exchange-runes.json', ninjaExchangeSchema],
    ['ninja-uniques-armours.json', ninjaItemOverviewSchema],
  ] as const)('%s', (file, schema) => {
    expect(() => parseOrThrow(schema as never, apiFixture(file), file)).not.toThrow()
  })
})

describe('contract: schema drift fails loudly', () => {
  it('poe.ninja renaming primaryValue', () => {
    const drifted = structuredClone(
      apiFixture<NinjaExchange>('ninja-exchange-currency.json'),
    ) as unknown as {
      lines: Array<Record<string, unknown>>
    }
    drifted.lines[0] = { ...drifted.lines[0], chaosEquivalent: 1, primaryValue: undefined }
    expect(() => parseOrThrow(ninjaExchangeSchema, drifted, 'poe.ninja Currency')).toThrow(
      SchemaError,
    )
    expect(() => parseOrThrow(ninjaExchangeSchema, drifted, 'poe.ninja Currency')).toThrow(
      /lines\.0\.primaryValue/,
    )
  })

  it('trade fetch with mods as objects (seen live in PoE 2, 9 Nov 2026)', () => {
    const body = {
      result: [
        {
          id: 'abc',
          listing: {
            whisper: '@seller hi',
            price: { amount: 3, currency: 'exalted', type: '~price' },
            account: { name: 'seller', online: { league: 'Runes of Aldur' } },
          },
          item: {
            typeLine: 'Waystone (Tier 15)',
            explicitMods: [{ name: '', tier: 'T1', magnitudes: [{ hash: 'x', min: 1, max: 2 }] }],
          },
        },
        null,
      ],
    }
    expect(() => parseOrThrow(tradeFetchSchema, body, 'fetch')).not.toThrow()
    expect(() =>
      parseOrThrow(tradeFetchSchema, { result: [{ id: 'a', item: {} }] }, 'fetch'),
    ).toThrow(SchemaError)
  })

  it('trade stats without entries', () => {
    expect(() =>
      parseOrThrow(tradeStatsSchema, { result: [{ id: 'x', label: 'X' }] }, 'stats'),
    ).toThrow(SchemaError)
  })

  it('empty league list', () => {
    expect(() => parseOrThrow(tradeLeaguesSchema, { result: [] }, 'leagues')).toThrow(SchemaError)
  })
})

describe('league selection', () => {
  const leagues = apiFixture<TradeLeagues>('trade-leagues.json')

  it('excludes HC, SSF, Standard and private leagues', () => {
    expect(
      [
        'Standard',
        'Hardcore',
        'HC Runes of Aldur',
        'SSF Runes of Aldur',
        'My League (PL12345)',
      ].some(isCandidateLeague),
    ).toBe(false)
    expect(isCandidateLeague('Runes of Aldur')).toBe(true)
  })

  it('asks the user when two leagues qualify (live data has two)', () => {
    const info = resolveLeague(leagues, null)
    expect(info.needsPick).toBe(true)
    expect(info.league).toBeNull()
    expect(info.candidates).toEqual(['Forbidden Rites', 'Runes of Aldur'])
    expect(info.all).toContain('Hardcore')
  })

  it('keeps a saved league while it exists, including manual HC choices', () => {
    expect(resolveLeague(leagues, 'Runes of Aldur')).toMatchObject({
      league: 'Runes of Aldur',
      needsPick: false,
    })
    expect(resolveLeague(leagues, 'HC Runes of Aldur').league).toBe('HC Runes of Aldur')
  })

  it('re-asks when the saved league disappears', () => {
    expect(resolveLeague(leagues, 'Old League').needsPick).toBe(true)
  })

  it('auto-picks a single candidate and falls back to Standard', () => {
    expect(
      resolveLeague(
        {
          result: [
            { id: 'A', text: 'A' },
            { id: 'Standard', text: 'S' },
          ],
        },
        null,
      ).league,
    ).toBe('A')
    expect(resolveLeague({ result: [{ id: 'Standard', text: 'S' }] }, null).league).toBe('Standard')
  })

  it('maps names to poe.ninja slugs', () => {
    const index = apiFixture<NinjaIndexState>('ninja-index-state.json')
    expect(ninjaLeagueSlug(index, 'Runes of Aldur')).toBe('runesofaldur')
    expect(ninjaLeagueSlug(null, 'New League')).toBe('newleague')
  })
})

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

const ok = (body: unknown): HttpResponse => ({ status: 200, header: () => null, body })

describe('poe.ninja loader', () => {
  it('treats "200 with 0 lines" as an error and keeps going', async () => {
    const currency = apiFixture('ninja-exchange-currency.json')
    const http = fakeHttp((url) => {
      if (url.includes('index-state')) return ok(apiFixture('ninja-index-state.json'))
      if (url.includes('type=Currency')) return ok(currency)
      if (url.includes('exchange'))
        return ok({ core: { items: [], rates: {}, primary: 'divine' }, lines: [], items: [] })
      return ok({ lines: [] })
    })
    const api = new NinjaApi(http, async () => {})
    const snap = await api.loadAll('Runes of Aldur')
    expect(snap.leagueSlug).toBe('runesofaldur')
    expect(Object.keys(snap.exchange)).toEqual(['Currency'])
    expect(snap.errors['Runes']).toMatch(/no lines/)
    expect(snap.errors['UniqueArmours']).toMatch(/no lines/)
    // One request per type, all with the league name.
    expect(http.calls.filter((c) => c.includes('league=Runes%20of%20Aldur'))).toHaveLength(23)
  })

  it('keeps the previous data for a type that fails', async () => {
    const currency = apiFixture<NinjaExchange>('ninja-exchange-currency.json')
    const http = fakeHttp(() => ({ status: 503, header: () => null, body: null }))
    const api = new NinjaApi(http, async () => {})
    const previous: NinjaSnapshot = {
      league: 'L',
      leagueSlug: 'l',
      fetchedAt: 0,
      exchange: { Currency: currency },
      uniques: {},
      errors: {},
    }
    const snap = await api.loadAll('L', previous)
    expect(snap.exchange['Currency']).toBe(currency)
    expect(snap.errors['Currency']).toMatch(/503/)
  })
})

describe('price index', () => {
  const snap: NinjaSnapshot = {
    league: 'Forbidden Rites',
    leagueSlug: 'forbiddenrites',
    fetchedAt: 0,
    exchange: {
      Currency: apiFixture<NinjaExchange>('ninja-exchange-currency.json'),
      Runes: apiFixture<NinjaExchange>('ninja-exchange-runes.json'),
    },
    uniques: { UniqueArmours: apiFixture<NinjaItemOverview>('ninja-uniques-armours.json') },
    errors: {},
  }
  const idx = new PriceIndex(snap)

  it('uses core.rates for Ex/Chaos and the vaal line for Vaal', () => {
    expect(idx.rates.exalted).toBe(snap.exchange.Currency.core.rates.exalted)
    expect(idx.rates.chaos).toBe(snap.exchange.Currency.core.rates.chaos)
    expect(idx.rates.vaal).toBeGreaterThan(0)
  })

  it('finds a commodity by name with sparkline, volume and link', () => {
    const alch = idx.findCommodity('Orb of Alchemy')!
    expect(alch.divine).toBeGreaterThan(0)
    expect(alch.sparkline).toHaveLength(7)
    expect(alch.url).toBe('https://poe.ninja/poe2/economy/forbiddenrites/currency/orb-of-alchemy')
    expect(idx.fromDivine(alch.divine, 'exalted')).toBeCloseTo(alch.divine * idx.rates.exalted)
  })

  it('finds runes from their own overview', () => {
    const name = snap.exchange.Runes.items[0].name
    expect(idx.findCommodity(name)?.type).toBe('Runes')
  })

  it('finds uniques and prefers the matching base', () => {
    const t = idx.findUnique('Temporalis', 'Silk Robe')
    expect(t?.divine).toBeGreaterThan(0)
    expect(t?.url).toContain('/unique-armours/')
  })

  it('converts listing prices to Divine', () => {
    expect(idx.toDivine(2, 'divine')).toBe(2)
    expect(idx.toDivine(100, 'exalted')).toBeCloseTo(100 * idx.divineValueOf('exalted')!)
    expect(idx.toDivine(1, 'not-a-currency')).toBeUndefined()
    expect(idx.rate('divine', 'exalted')).toBeCloseTo(1 / idx.divineValueOf('exalted')!)
  })
})

describe('currency icons', () => {
  it('maps every trade currency id to a name and a GGG CDN icon', async () => {
    const { buildCurrencyInfo } = await import('../../src/shared/currency-info')
    const info = buildCurrencyInfo(apiFixture('trade-static.json'))
    for (const id of ['divine', 'exalted', 'chaos', 'vaal']) {
      expect(info.get(id)?.icon).toMatch(/^https:\/\/web\.poecdn\.com\/gen\/image\/.+\.png$/)
    }
    expect(info.get('divine')?.name).toBe('Divine Orb')
  })
})
