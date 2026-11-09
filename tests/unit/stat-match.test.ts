import { describe, expect, it } from 'vitest'
import { parseItem } from '../../src/shared/parser/parse'
import { StatMatcher, type TradeStatGroup } from '../../src/shared/stat-match'
import { apiFixture, loadClipboardFixtures as loadFixtures, seed } from '../helpers'

const stats = apiFixture<{ result: TradeStatGroup[] }>('trade-stats.json')
const matcher = new StatMatcher(stats.result)
const fx = (name: string) => parseItem(seed(name))

describe('stat matcher', () => {
  it('maps plain explicit lines', () => {
    const lines = matcher.matchItem(fx('ee2-rare-belt.txt'))
    const life = lines.find((l) => l.line.text === '+161 to maximum Life')
    expect(life?.match).toMatchObject({ id: 'explicit.stat_3299347043', value: 161 })
  })

  it('maps "reduced" to an "increased" stat with a negative value', () => {
    const lines = matcher.matchItem(fx('ee2-rare-body-armour.txt'))
    const bleed = lines.find((l) => l.line.text.includes('Bleeding'))
    expect(bleed?.match).toMatchObject({
      id: 'explicit.stat_1692879867',
      value: -48,
      negated: true,
    })
    expect(bleed?.match?.ranges).toEqual([[-50, -46]])
  })

  it('prefers (Local) stats on armour and weapons', () => {
    const lines = matcher.matchItem(fx('ee2-rare-ring.txt'))
    const ringEva = lines.find((l) => l.line.text === '+143 to Evasion Rating')
    expect(ringEva?.match?.text).not.toContain('(Local)')
    const shieldLike = parseItem(`Item Class: Body Armours
Rarity: Rare
X
Y
--------
{ Prefix Modifier "A" (Tier: 1) }
+50 to Evasion Rating`)
    const local = matcher.matchItem(shieldLike)[0]
    expect(local.match?.text).toBe('# to Evasion Rating (Local)')
  })

  it('uses the implicit group for implicits and the rune group for runes', () => {
    const belt = matcher.matchItem(fx('ee2-rare-belt.txt'))
    expect(belt[0].match?.id.startsWith('implicit.')).toBe(true)
    const armour = matcher.matchItem(fx('ee2-rare-body-armour.txt'))
    expect(armour.find((l) => l.mod.type === 'rune')?.match?.id.startsWith('rune.')).toBe(true)
  })

  it('maps waystone and tablet mods (Map variant)', () => {
    const tablet = matcher.matchItem(fx('ee2-tablet-legacy-precursor.txt'))
    const splinters = tablet.find((l) => l.line.text.includes('Simulacrum'))
    expect(splinters?.match?.id).toBe('explicit.stat_3836551197')
    const waystone = matcher.matchItem(fx('ee2-waystone-rare.txt'))
    expect(waystone.find((l) => l.line.text.includes('Shocked Ground'))?.match?.id).toBe(
      'explicit.stat_3477720557',
    )
  })

  it('maps ≥95% of explicit-like mod lines across all fixtures', () => {
    let total = 0
    let matched = 0
    const misses: string[] = []
    for (const [name, text] of loadFixtures()) {
      const item = parseItem(text)
      if (!['gear', 'waystone', 'tablet', 'unique'].includes(item.kind)) continue
      for (const l of matcher.matchItem(item)) {
        if (l.consumed || l.mod.type === 'implicit') continue
        total++
        if (l.match) matched++
        else misses.push(`${name}: ${l.line.text}`)
      }
    }
    const rate = matched / total
    if (rate < 0.95) console.log(misses.join('\n'))
    expect(total).toBeGreaterThan(40)
    expect(rate).toBeGreaterThanOrEqual(0.95)
  })

  it('searches stats for the Add Stat dropdown', () => {
    const hits = matcher.search('total elemental resistance')
    expect(hits.some((h) => h.id === 'pseudo.pseudo_total_elemental_resistance')).toBe(true)
  })
})
