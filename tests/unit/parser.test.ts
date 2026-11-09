import { describe, expect, it } from 'vitest'
import { parseItem } from '../../src/shared/parser/parse'
import { parseStatLine, stripMarkup, toTemplate } from '../../src/shared/parser/stat-line'
import { loadClipboardFixtures as loadFixtures, seed as fx } from '../helpers'

describe('stat lines', () => {
  it('collapses rolls and keeps sorted ranges', () => {
    const l = parseStatLine('48(50-46)% reduced Duration of Bleeding on You')
    expect(l.text).toBe('48% reduced Duration of Bleeding on You')
    expect(l.values).toEqual([48])
    expect(l.ranges).toEqual([[46, 50]])
  })

  it('handles signs, decimals and several values', () => {
    expect(parseStatLine('+143(124-151) to Evasion Rating').values).toEqual([143])
    expect(parseStatLine('Adds 5(4-6) to 10(9-12) Physical Damage').values).toEqual([5, 10])
    expect(parseStatLine('Skills have -1.95(-2--1.9) seconds to Cooldown').values).toEqual([-1.95])
  })

  it('flags unscalable values', () => {
    const l = parseStatLine('Area has patches of Shocked Ground — Unscalable Value')
    expect(l.unscalable).toBe(true)
    expect(l.text).toBe('Area has patches of Shocked Ground')
  })

  it('strips [a|b] markup and builds trade templates', () => {
    expect(stripMarkup('+(10-20)% to all [ElementalDamage|Elemental] [Resistances]')).toBe(
      '+(10-20)% to all Elemental Resistances',
    )
    expect(toTemplate('+12 to Strength')).toBe('# to Strength')
    expect(toTemplate('Adds 5 to 10 Physical Damage')).toBe('Adds # to # Physical Damage')
  })
})

describe('parser', () => {
  it('parses every fixture without throwing or losing the header', () => {
    for (const [name, text] of loadFixtures()) {
      const item = parseItem(text)
      expect(item.itemClass, name).not.toBe('')
      expect(item.rarity, name).not.toBe('')
      expect(item.typeLine, name).not.toBe('')
      expect(item.unparsed, name).toEqual([])
    }
  })

  it('rare gear: class, base, rarity, ilvl, mods, requirements, note', () => {
    const item = parseItem(fx('ee2-rare-body-armour.txt'))
    expect(item).toMatchObject({
      itemClass: 'Body Armours',
      rarity: 'Rare',
      name: 'Hate Pelt',
      typeLine: 'Soldier Cuirass',
      kind: 'gear',
      itemLevel: 80,
      quality: 20,
      sockets: 'S S S',
      requirements: { level: 65, str: 121 },
      note: '~b/o 10 divine',
      advanced: true,
    })
    expect(item.mods.filter((m) => m.generation === 'prefix')).toHaveLength(3)
    expect(item.mods.filter((m) => m.generation === 'suffix')).toHaveLength(3)
    expect(item.mods.find((m) => m.type === 'rune')?.lines[0].text).toBe(
      '54% increased Armour, Evasion and Energy Shield',
    )
    expect(item.mods.find((m) => m.name === 'Unmoving')?.type).toBe('desecrated')
    // Hybrid prefix keeps both lines.
    expect(item.mods.find((m) => m.name === 'Hardened')?.lines).toHaveLength(2)
  })

  it('implicits and tags', () => {
    const item = parseItem(fx('ee2-rare-belt.txt'))
    const implicits = item.mods.filter((m) => m.type === 'implicit')
    expect(implicits).toHaveLength(2)
    expect(implicits[1].tags).toEqual(['Charm'])
  })

  it('waystone: tier from base, generic header, both affix types, no item quantity', () => {
    const item = parseItem(fx('ee2-waystone-corrupted-all-props.txt'))
    expect(item.kind).toBe('waystone')
    expect(item.waystone).toEqual({ tier: 16 })
    expect(item.flags.corrupted).toBe(true)
    const props = Object.fromEntries(item.properties.map((p) => [p.key, p.number]))
    expect(props).toMatchObject({
      'Revives Available': 0,
      'Pack Size': 20,
      'Magic Monsters': 30,
      'Monster Effectiveness': 45,
      'Waystone Drop Chance': 90,
    })
    expect(props['Item Quantity']).toBeUndefined()
    expect(item.properties.every((p) => p.augmented)).toBe(true)
    expect(item.mods).toHaveLength(6)
    expect(item.mods.flatMap((m) => m.lines).filter((l) => l.unscalable)).toHaveLength(1)
  })

  it('tablet: legacy Precursor base, uses remaining, mechanic, corrupted', () => {
    const item = parseItem(fx('ee2-tablet-legacy-precursor.txt'))
    expect(item.kind).toBe('tablet')
    expect(item.typeLine).toBe('Delirium Precursor Tablet')
    expect(item.tablet).toEqual({
      usesRemaining: 17,
      mechanic: 'Adds a Mirror of Delirium to a Map',
    })
    expect(item.flags.corrupted).toBe(true)
    expect(item.mods.filter((m) => m.type === 'explicit')).toHaveLength(4)
  })

  it('magic tablet keeps its affixed type line', () => {
    const item = parseItem(fx('hand-tablet-breach.txt'))
    expect(item).toMatchObject({ kind: 'tablet', typeLine: 'Breeding Breach Tablet' })
    expect(item.tablet?.usesRemaining).toBe(5)
  })

  it('unique tablet is priced as a unique', () => {
    expect(parseItem(fx('hand-unique-tablet.txt')).kind).toBe('unique')
  })

  it('unique: flavour text is ignored', () => {
    const item = parseItem(fx('ee2-unique-focus.txt'))
    expect(item).toMatchObject({
      kind: 'unique',
      name: 'The Eternal Spark',
      typeLine: 'Crystal Focus',
    })
    expect(item.mods).toHaveLength(5)
    expect(item.requirements).toEqual({ level: 26, int: 43 })
  })

  it('currency stacks and socketables are commodities', () => {
    const ex = parseItem(fx('hand-currency-exalted.txt'))
    expect(ex).toMatchObject({
      kind: 'commodity',
      typeLine: 'Exalted Orb',
      stack: { current: 7, max: 5000 },
    })
    expect(parseItem(fx('hand-rune.txt')).kind).toBe('commodity')
    expect(parseItem(fx('hand-soul-core.txt')).kind).toBe('commodity')
  })

  it('normal item with a single name line', () => {
    const item = parseItem(fx('ee2-normal-shield.txt'))
    expect(item).toMatchObject({ kind: 'gear', rarity: 'Normal', typeLine: 'Polished Targe' })
    expect(item.name).toBeUndefined()
  })

  it('basic (non-advanced) copy still yields typed mods', () => {
    const basic = `Item Class: Rings
Rarity: Rare
Rune Loop
Prismatic Ring
--------
Item Level: 79
--------
+8% to all Elemental Resistances (implicit)
--------
+143 to Evasion Rating
+12 to Strength`
    const item = parseItem(basic)
    expect(item.advanced).toBe(false)
    expect(item.mods.map((m) => m.type)).toEqual(['implicit', 'explicit', 'explicit'])
  })
})

describe('parser fuzz', () => {
  it('random line deletion and duplication never throws', () => {
    let seed = 42
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
    for (const [, text] of loadFixtures()) {
      const lines = text.split('\n')
      for (let i = 0; i < 50; i++) {
        const mutated = lines.flatMap((l) => {
          const r = rand()
          return r < 0.15
            ? []
            : r < 0.3
              ? [l, l]
              : r < 0.35
                ? [l.slice(0, Math.floor(l.length * rand()))]
                : [l]
        })
        expect(() => parseItem(mutated.join('\n'))).not.toThrow()
      }
    }
    expect(() => parseItem('')).not.toThrow()
    expect(() => parseItem('{ broken')).not.toThrow()
  })
})
