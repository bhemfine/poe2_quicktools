import { describe, expect, it } from 'vitest'
import { parseItem } from '../../src/shared/parser/parse'
import { effectivenessBreakdown, toListings } from '../../src/shared/pricing/listings'
import { buildQuery, tradeSiteUrl } from '../../src/shared/query/build'
import {
  buildModel,
  categoryFor,
  defaultMin,
  gearBase,
  labelKey,
  mapFilterIds,
  tabletBase,
  USES_REMAINING_STAT,
  type ModelContext,
} from '../../src/shared/query/model'
import type { TradeFilters, TradeItems } from '../../src/shared/schemas'
import { StatMatcher, type TradeStatGroup } from '../../src/shared/stat-match'
import { apiFixture, seed } from '../helpers'

const filters = apiFixture<TradeFilters>('trade-filters.json')
const items = apiFixture<TradeItems>('trade-items.json')
const matcher = new StatMatcher(apiFixture<{ result: TradeStatGroup[] }>('trade-stats.json').result)
const ctx: ModelContext = { filters, items, minRollPercent: 10, onlineOnly: true, jackpotMods: [] }

function model(file: string, c: Partial<ModelContext> = {}) {
  const item = parseItem(seed(file))
  return buildModel(item, matcher.matchItem(item), { ...ctx, ...c })
}

describe('helpers', () => {
  it('default min is value minus a relative percentage', () => {
    expect(defaultMin(34, 10)).toBe(30)
    expect(defaultMin(161, 10)).toBe(144)
    expect(defaultMin(2.5, 10)).toBe(2.2)
  })

  it('maps waystone header keys to map_filters by live label', () => {
    const ids = mapFilterIds(filters)
    expect(ids.get(labelKey('Pack Size'))?.id).toBe('map_packsize')
    expect(ids.get(labelKey('Revives Available'))?.id).toBe('map_revives')
    expect(ids.get(labelKey('Waystone Drop Chance'))?.id).toBe('map_bonus')
    expect(ids.get(labelKey('Item Rarity'))?.id).toBe('map_iir')
    expect(ids.get(labelKey('Monster Effectiveness'))?.id).toBe('map_magic_monsters')
    expect(ids.get(labelKey('Waystone Tier'))?.id).toBe('map_tier')
  })

  it('maps item classes to trade categories', () => {
    expect(categoryFor('Body Armours', filters)).toBe('armour.chest')
    expect(categoryFor('Rings', filters)).toBe('accessory.ring')
    expect(categoryFor('Wands', filters)).toBe('weapon.wand')
    expect(categoryFor('Belts', filters)).toBe('accessory.belt')
  })

  it('finds tablet bases, including magic names and legacy Precursor names', () => {
    expect(tabletBase('Delirium Precursor Tablet', items)).toBe('Delirium Tablet')
    expect(tabletBase('Breeding Breach Tablet', items)).toBe('Breach Tablet')
    expect(tabletBase('Ritual Tablet', items)).toBe('Ritual Tablet')
  })

  it('strips magic affixes from gear bases', () => {
    const magic = parseItem(
      'Item Class: Rings\nRarity: Magic\nVaporous Prismatic Ring of the Penguin',
    )
    expect(gearBase(magic, items)).toBe('Prismatic Ring')
  })
})

describe('waystone query', () => {
  const m = model('ee2-waystone-rare.txt')

  it('uses type + map_filters with tier pinned and value props checked', () => {
    expect(m.type).toBe('Waystone (Tier 14)')
    const byId = Object.fromEntries(m.props.map((p) => [p.id, p]))
    expect(byId.map_tier).toMatchObject({ enabled: true, min: 14, max: 14 })
    expect(byId.map_packsize).toMatchObject({ enabled: true, value: 34, min: 30 })
    expect(byId.map_bonus).toMatchObject({ enabled: true, value: 75, min: 67 })
    expect(byId.map_revives).toMatchObject({ enabled: false, value: 2 })
    expect(byId.corrupted).toMatchObject({ enabled: true, option: 'false' })
  })

  it('explicit mods are optional (off by default) and can be excluded', () => {
    expect(m.stats.length).toBeGreaterThan(0)
    expect(m.stats.every((s) => !s.enabled)).toBe(true)
    const q1 = buildQuery(m)
    expect(q1.query.type).toBe('Waystone (Tier 14)')
    expect(q1.query.filters.map_filters.filters).toMatchObject({
      map_tier: { min: 14, max: 14 },
      map_packsize: { min: 30 },
    })
    expect(q1.query.stats).toEqual([{ type: 'and', filters: [] }])

    const excluded = {
      ...m,
      stats: m.stats.map((s, i) => (i === 0 ? { ...s, enabled: true, mode: 'not' as const } : s)),
    }
    expect(buildQuery(excluded).query.stats).toEqual([
      { type: 'not', filters: [{ id: m.stats[0].id, disabled: false }] },
    ])
  })

  it('corrupted waystones search corrupted listings', () => {
    const c = model('ee2-waystone-corrupted-all-props.txt')
    expect(c.props.find((p) => p.id === 'corrupted')?.option).toBe('true')
    expect(c.props.find((p) => p.id === 'map_magic_monsters')?.value).toBe(45)
  })
})

describe('tablet query', () => {
  it('type + uses remaining pseudo + explicits on', () => {
    const m = model('ee2-tablet-legacy-precursor.txt')
    expect(m.type).toBe('Delirium Tablet')
    expect(m.category).toBe('map.tablet')
    expect(m.stats[0]).toMatchObject({ id: USES_REMAINING_STAT, min: 17, enabled: true })
    const explicit = m.stats.filter((s) => s.modType === 'explicit')
    expect(explicit.length).toBeGreaterThan(0)
    expect(explicit.every((s) => s.enabled)).toBe(true)
    const q = buildQuery(m)
    expect(q.query.type).toBe('Delirium Tablet')
    expect(q.query.filters.type_filters.filters).toMatchObject({
      category: { option: 'map.tablet' },
    })
    expect(q.query.stats[0].filters[0]).toEqual({
      id: USES_REMAINING_STAT,
      value: { min: 17 },
      disabled: false,
    })
  })

  it('jackpot mods are flagged and forced on', () => {
    const plain = model('hand-tablet-breach.txt')
    const id = plain.stats.find((s) => s.modType === 'explicit')!.id
    const m = model('hand-tablet-breach.txt', { jackpotMods: [id] })
    expect(m.stats.find((s) => s.id === id)).toMatchObject({ jackpot: true, enabled: true })
  })
})

describe('gear query', () => {
  it('rare: category + nonunique + explicit mods with min rolls', () => {
    const m = model('ee2-rare-belt.txt')
    expect(m).toMatchObject({ category: 'accessory.belt', rarity: 'nonunique', useBaseType: false })
    const life = m.stats.find((s) => s.itemText === '+161 to maximum Life')!
    expect(life).toMatchObject({ enabled: true, min: 144 })
    expect(m.stats.filter((s) => s.modType === 'implicit').every((s) => !s.enabled)).toBe(true)
    const q = buildQuery(m)
    expect(q.query.type).toBeUndefined()
    expect(q.query.filters.type_filters.filters).toEqual({
      category: { option: 'accessory.belt' },
      rarity: { option: 'nonunique' },
    })
  })

  it('reduced stats bound the max with a negative value', () => {
    const m = model('ee2-rare-body-armour.txt')
    const bleed = m.stats.find((s) => s.itemText.includes('Bleeding'))!
    expect(bleed).toMatchObject({ value: -48, max: -43, negated: true })
    expect(bleed.min).toBeUndefined()
  })

  it('switching to base type replaces the category', () => {
    const m = { ...model('ee2-rare-ring.txt'), useBaseType: true }
    const q = buildQuery(m)
    expect(q.query.type).toBe('Prismatic Ring')
    expect(q.query.filters.type_filters.filters.category).toBeUndefined()
  })

  it('online-only toggles listing status', () => {
    expect(buildQuery(model('ee2-rare-ring.txt')).query.status.option).toBe('online')
    expect(buildQuery(model('ee2-rare-ring.txt', { onlineOnly: false })).query.status.option).toBe(
      'any',
    )
  })
})

describe('unique query', () => {
  it('searches by name and base', () => {
    const q = buildQuery(model('ee2-unique-focus.txt'))
    expect(q.query).toMatchObject({ name: 'The Eternal Spark', type: 'Crystal Focus' })
    expect(q.query.filters.type_filters.filters).toEqual({ rarity: { option: 'unique' } })
  })
})

describe('listings and helpers', () => {
  it('normalizes and sorts listings by Divine value', () => {
    const prices = {
      toDivine: (a: number, c: string) =>
        c === 'divine' ? a : c === 'exalted' ? a / 600 : undefined,
    }
    const rows = toListings(
      {
        result: [
          {
            id: 'a',
            listing: {
              price: { amount: 2, currency: 'divine' },
              account: { name: 'A', online: { league: 'x' } },
              whisper: '@A hi',
            },
            item: {},
          },
          null,
          {
            id: 'b',
            listing: {
              price: { amount: 300, currency: 'exalted' },
              account: { name: 'B', online: null },
            },
            item: {},
          },
          {
            id: 'c',
            listing: { price: { amount: 1, currency: 'mystery' }, account: { name: 'C' } },
            item: {},
          },
        ],
      },
      prices as never,
    )
    expect(rows.map((r) => r.id)).toEqual(['b', 'a', 'c'])
    expect(rows[0]).toMatchObject({ divine: 0.5, online: false })
    expect(rows[1]).toMatchObject({ online: true, whisper: '@A hi' })
    expect(rows[2].divine).toBeUndefined()
  })

  it('effectiveness breakdown follows the in-game keyword text', () => {
    expect(effectivenessBreakdown(45)).toEqual({
      toughness: 45,
      damageTakenFactor: 1 / 1.45,
      experience: 22.5,
      quantity: 22.5,
    })
  })

  it('links to the trade site', () => {
    expect(tradeSiteUrl('Runes of Aldur', 'abc')).toBe(
      'https://www.pathofexile.com/trade2/search/poe2/Runes%20of%20Aldur/abc',
    )
  })
})
