// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InvokeChannel } from '../../src/shared/ipc'
import { PriceIndex } from '../../src/shared/pricing/ninja'
import type {
  NinjaExchange,
  NinjaItemOverview,
  TradeFilters,
  TradeItems,
  TradeLeagues,
  TradeStatic,
  TradeStats,
} from '../../src/shared/schemas'
import { defaultSettings } from '../../src/shared/settings'
import { StatMatcher } from '../../src/shared/stat-match'
import type { TradeData } from '../../src/shared/trade-data'
import leagues from '../fixtures/api/trade-leagues.json'
import stats from '../fixtures/api/trade-stats.json'
import items from '../fixtures/api/trade-items.json'
import filters from '../fixtures/api/trade-filters.json'
import staticData from '../fixtures/api/trade-static.json'
import currency from '../fixtures/api/ninja-exchange-currency.json'
import runes from '../fixtures/api/ninja-exchange-runes.json'
import uniques from '../fixtures/api/ninja-uniques-armours.json'
import exalted from '../fixtures/clipboard/seed/hand-currency-exalted.txt?raw'
import waystone from '../fixtures/clipboard/seed/ee2-waystone-rare.txt?raw'
import tablet from '../fixtures/clipboard/seed/ee2-tablet-legacy-precursor.txt?raw'
import rare from '../fixtures/clipboard/seed/ee2-rare-belt.txt?raw'

const invoke = vi.fn(async (channel: InvokeChannel, ...args: unknown[]): Promise<unknown> => {
  switch (channel) {
    case 'trade:search':
      return { ok: true, data: { id: 'Q1', result: ['a', 'b'], total: 42 } }
    case 'trade:fetch':
      return {
        ok: true,
        data: {
          result: (args[0] as string[]).map((id, i) => ({
            id,
            listing: {
              price: { amount: 10 + i, currency: 'exalted' },
              account: { name: `seller${i}`, online: i === 0 ? { league: 'x' } : null },
              whisper: `@seller${i} hi`,
            },
            item: {},
          })),
        },
      }
    default:
      return undefined
  }
})
;(globalThis as unknown as { window: { quicktools: unknown } }).window.quicktools = {
  invoke,
  on: () => () => {},
}

const { useEconomyStore } = await import('../../src/renderer/stores/economy')
const { useSettingsStore } = await import('../../src/renderer/stores/settings')
const PriceCheckCard = (await import('../../src/renderer/components/cards/PriceCheckCard.vue'))
  .default
const ConverterHud = (await import('../../src/renderer/components/ConverterHud.vue')).default

const trade: TradeData = {
  leagues: leagues as TradeLeagues,
  stats: stats as TradeStats,
  items: items as TradeItems,
  filters: filters as TradeFilters,
  static: staticData as TradeStatic,
  version: 'test',
}

function setup(): void {
  setActivePinia(createPinia())
  const economy = useEconomyStore()
  economy.trade = trade
  economy.matcher = new StatMatcher(trade.stats.result)
  economy.prices = new PriceIndex({
    league: 'Forbidden Rites',
    leagueSlug: 'forbiddenrites',
    fetchedAt: Date.now(),
    exchange: { Currency: currency as NinjaExchange, Runes: runes as NinjaExchange },
    uniques: { UniqueArmours: uniques as unknown as NinjaItemOverview },
    errors: {},
  })
  economy.league = { league: 'Forbidden Rites', candidates: [], all: [], needsPick: false }
  economy.rateLimits = [
    {
      policy: 'trade-search-request-limit',
      windows: [{ limit: 5, period: 10, restrict: 60, used: 1 }],
      restrictedUntil: null,
      queued: 0,
    },
  ]
  useSettingsStore().settings = defaultSettings()
}

describe('price check cards render from fixtures', () => {
  beforeEach(() => {
    invoke.mockClear()
    setup()
  })

  it('commodity: ninja price in currencies, stack value, trend, link', async () => {
    const w = mount(PriceCheckCard, { props: { id: 1, text: exalted } })
    await flushPromises()
    const text = w.text()
    expect(text).toContain('Exalted Orb')
    expect(text).toMatch(/Div/)
    expect(text).toMatch(/Ex/)
    expect(text).toContain('Stack of 7')
    expect(text).toMatch(/7d [+-]/)
    expect(
      w.find('a[href*="poe.ninja/poe2/economy/forbiddenrites/currency/exalted-orb"]').exists(),
    ).toBe(true)
    expect(invoke).not.toHaveBeenCalledWith('trade:search', expect.anything(), expect.anything())
  })

  it('waystone: map filters, effectiveness-free header, live listings normalized to Div', async () => {
    const w = mount(PriceCheckCard, { props: { id: 2, text: waystone } })
    await flushPromises()
    const text = w.text()
    expect(text).toContain('Waystone Tier')
    expect(text).toContain('Pack Size')
    expect(text).toContain('42 listed')
    expect(text).toContain('seller0')
    // Listing prices show currency icons; the comparison column picks a readable currency.
    expect(w.find('tbody img[alt="Ex"]').attributes('src')).toMatch(/^https:\/\/web\.poecdn\.com\//)
    expect(w.find('thead img').exists()).toBe(true)
    expect(text).toContain('Searches: 1/5 per 10 s')
    const [, query] = invoke.mock.calls.find((c) => c[0] === 'trade:search')!
    expect((query as { query: { type: string } }).query.type).toBe('Waystone (Tier 14)')
  })

  it('tablet: base, uses remaining and explicit filters', async () => {
    const w = mount(PriceCheckCard, { props: { id: 3, text: tablet } })
    await flushPromises()
    expect(w.text()).toContain('17 uses remaining')
    expect(w.text()).toContain('Map Device')
    const [, query] = invoke.mock.calls.find((c) => c[0] === 'trade:search')!
    expect((query as { query: { type: string } }).query.type).toBe('Delirium Tablet')
  })

  it('rare: per-mod toggles, add stat, whisper copied to clipboard', async () => {
    const w = mount(PriceCheckCard, { props: { id: 4, text: rare } })
    await flushPromises()
    expect(w.text()).toContain('+161 to maximum Life')
    expect(w.find('input[placeholder^="+ Add stat"]').exists()).toBe(true)
    const whisper = w.findAll('button').find((b) => b.text() === 'Whisper')!
    await whisper.trigger('click')
    expect(invoke).toHaveBeenCalledWith('clipboard:write', '@seller0 hi')
  })

  it('unique: ninja price first, live listings on demand', async () => {
    const temporalis = `Item Class: Body Armours
Rarity: Unique
Temporalis
Silk Robe
--------
Item Level: 80
--------
{ Unique Modifier }
+120(100-150) to maximum Energy Shield`
    const w = mount(PriceCheckCard, { props: { id: 5, text: temporalis } })
    await flushPromises()
    expect(w.text()).toContain('Open on poe.ninja')
    expect(invoke).not.toHaveBeenCalledWith('trade:search', expect.anything(), expect.anything())
    await w
      .findAll('button')
      .find((b) => b.text() === 'Live listings')!
      .trigger('click')
    await flushPromises()
    expect(invoke).toHaveBeenCalledWith('trade:search', expect.objectContaining({}), 'check-5')
  })

  it('unsupported items fall back to the raw card', async () => {
    const gem = 'Item Class: Skill Gems\nRarity: Gem\nFireball\n--------\nLevel: 1'
    const w = mount(PriceCheckCard, { props: { id: 6, text: gem } })
    expect(w.text()).toContain('not priced in v1')
    expect(w.text()).toContain('Copy item text for a bug report')
  })
})

describe('converter HUD', () => {
  beforeEach(setup)

  it('converts with poe.ninja rates and lists favourite pairs', async () => {
    const w = mount(ConverterHud)
    await flushPromises()
    expect(w.text()).toContain('Currency converter')
    expect(w.text()).toMatch(/= [\d.k]+\s*Exalted Orb/)
    expect(w.find('img[alt="Ex"]').exists()).toBe(true)
    expect(w.text()).toContain('poe.ninja average')
    expect(w.findAll('li').length).toBe(2)
  })
})
