import { toTemplate } from '../parser/stat-line'
import type { ModType, ParsedItem, StatLine } from '../parser/types'

/** One entry of trade2 `/data/stats` (`result[].entries[]`). */
export interface TradeStat {
  id: string
  text: string
  type: string
}
export interface TradeStatGroup {
  id: string
  label: string
  entries: TradeStat[]
}

export interface StatMatch {
  /** Trade stat id, e.g. "explicit.stat_3299347043". */
  id: string
  text: string
  /** Value to search with (sign flipped when the item says "reduced" but the stat says "increased"). */
  value?: number
  /** All values in the line, adjusted the same way. */
  values: number[]
  ranges: StatLine['ranges']
  negated: boolean
}

export interface MatchedLine {
  mod: { type: ModType; generation?: 'prefix' | 'suffix'; tier?: number; name?: string }
  line: StatLine
  /** Several lines of one hybrid mod can map to one multi-line stat; the rest are `consumed`. */
  match: StatMatch | null
  consumed?: boolean
}

const GROUP_FOR_MOD: Record<ModType, string[]> = {
  explicit: ['explicit'],
  implicit: ['implicit', 'explicit'],
  rune: ['rune', 'explicit'],
  enchant: ['enchant', 'implicit'],
  corrupted: ['enchant', 'implicit'],
  desecrated: ['desecrated', 'explicit'],
  fractured: ['fractured', 'explicit'],
  crafted: ['crafted', 'explicit'],
}

const SWAPS: Array<[RegExp, string]> = [
  [/\bincreased\b/, 'reduced'],
  [/\breduced\b/, 'increased'],
  [/\bmore\b/, 'less'],
  [/\bless\b/, 'more'],
]

/** Item classes whose armour/evasion/ES/accuracy stats are "(Local)" on trade. */
const LOCAL_CLASSES =
  /Armours|Helmets|Gloves|Boots|Shields|Bucklers|Foci|Bows|Crossbows|Wands|Staves|Sceptres|Quarterstaves|Maces|Swords|Axes|Daggers|Claws|Spears|Flails|Talismans|Traps|One Hand|Two Hand/

export class StatMatcher {
  /** group id → normalized template → entries (several ids can share one text across groups). */
  private byGroup = new Map<string, Map<string, TradeStat>>()
  private multiLine = new Map<string, TradeStat[]>()
  readonly all: TradeStat[] = []

  constructor(groups: readonly TradeStatGroup[]) {
    for (const g of groups) {
      const map = new Map<string, TradeStat>()
      for (const e of g.entries) {
        this.all.push(e)
        const tpl = normalize(e.text)
        if (!map.has(tpl)) map.set(tpl, e)
        if (e.text.includes('\n')) {
          const list = this.multiLine.get(g.id) ?? []
          list.push(e)
          this.multiLine.set(g.id, list)
        }
      }
      this.byGroup.set(g.id, map)
    }
  }

  /** Matches one stat line for a mod type. */
  matchLine(line: StatLine, modType: ModType, local = false): StatMatch | null {
    for (const group of GROUP_FOR_MOD[modType]) {
      const map = this.byGroup.get(group)
      if (!map) continue
      const tpl = normalize(line.text)
      const candidates = local ? [`${tpl} (Local)`, tpl] : [tpl, `${tpl} (Local)`]
      for (const c of candidates) {
        const hit = map.get(c)
        if (hit) return toMatch(hit, line, false)
      }
      for (const [re, to] of SWAPS) {
        if (!re.test(tpl)) continue
        const swapped = tpl.replace(re, to)
        const hit = map.get(swapped) ?? map.get(`${swapped} (Local)`)
        if (hit) return toMatch(hit, line, true)
      }
    }
    return null
  }

  /** Matches every stat line of a parsed item, joining hybrid lines into multi-line stats. */
  matchItem(item: ParsedItem): MatchedLine[] {
    const local = LOCAL_CLASSES.test(item.itemClass)
    const out: MatchedLine[] = []
    for (const mod of item.mods) {
      const info = { type: mod.type, generation: mod.generation, tier: mod.tier, name: mod.name }
      for (let i = 0; i < mod.lines.length; i++) {
        const line = mod.lines[i]
        const next = mod.lines[i + 1]
        if (next) {
          const joined = this.matchMultiLine(line, next, mod.type)
          if (joined) {
            out.push({ mod: info, line, match: joined })
            out.push({ mod: info, line: next, match: null, consumed: true })
            i++
            continue
          }
        }
        out.push({ mod: info, line, match: this.matchLine(line, mod.type, local) })
      }
    }
    return out
  }

  private matchMultiLine(a: StatLine, b: StatLine, modType: ModType): StatMatch | null {
    const tpl = `${normalize(a.text)}\n${normalize(b.text)}`
    for (const group of GROUP_FOR_MOD[modType]) {
      const hit = this.multiLine.get(group)?.find((e) => normalize(e.text) === tpl)
      if (hit) {
        return toMatch(
          hit,
          {
            ...a,
            text: `${a.text}\n${b.text}`,
            values: [...a.values, ...b.values],
            ranges: [...a.ranges, ...b.ranges],
          },
          false,
        )
      }
    }
    return null
  }

  byId(id: string): TradeStat | undefined {
    return this.all.find((s) => s.id === id)
  }

  /** Free-text search for the "Add stat" dropdown. */
  search(query: string, limit = 30): TradeStat[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return []
    const seen = new Set<string>()
    const out: TradeStat[] = []
    for (const s of this.all) {
      const t = s.text.toLowerCase()
      if (words.every((w) => t.includes(w)) && !seen.has(s.id)) {
        seen.add(s.id)
        out.push(s)
        if (out.length >= limit) break
      }
    }
    return out
  }
}

function normalize(text: string): string {
  return text
    .split('\n')
    .map((l) => toTemplate(l))
    .join('\n')
}

function toMatch(stat: TradeStat, line: StatLine, negated: boolean): StatMatch {
  const sign = negated ? -1 : 1
  const values = line.values.map((v) => v * sign)
  return {
    id: stat.id,
    text: stat.text,
    value: values.length ? average(values) : undefined,
    values,
    ranges: line.ranges.map((r) => (r && negated ? ([-r[1], -r[0]] as [number, number]) : r)),
    negated,
  }
}

/** "Adds 5 to 10 Damage" searches by the average, like the trade site. */
function average(values: number[]): number {
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  return Math.round(avg * 100) / 100
}
