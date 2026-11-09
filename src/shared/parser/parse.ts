// Section layout and mod grouping follow Exiled-Exchange-2 renderer/src/parser/Parser.ts @ cca30662
// (MIT), rewritten for QuickTools: no game-data lookups inside the parser, never throws.
import { isModHeaderLine, parseModHeader, splitTypeSuffix } from './mod-header'
import { parseStatLine } from './stat-line'
import type { HeaderProperty, ItemKind, ParsedItem, ParsedMod } from './types'

const SEPARATOR = '--------'

/** Item classes priced as commodities (poe.ninja exchange) regardless of rarity line. */
const COMMODITY_CLASSES = new Set([
  'Stackable Currency',
  'Socketable',
  'Omen',
  'Map Fragments',
  'Delirium Splinter',
  'Breach Splinter',
  'Expedition Logbook',
  'Uncut Skill Gems',
  'Uncut Spirit Gems',
  'Uncut Support Gems',
  'Idols',
  'Verisium',
  'Essences',
  'Soul Cores',
  'Runes',
  'Catalysts',
  'Distilled Emotions',
  'Inscribed Ultimatum',
  'Pinnacle Keys',
  'Trial Coins',
])

const NON_GEAR_CLASSES = new Set(['Quest Items', 'Skill Gems', 'Support Gems', 'Spirit Gems'])

const FLAG_LINES: Record<string, keyof ParsedItem['flags']> = {
  Corrupted: 'corrupted',
  'Twice Corrupted': 'twiceCorrupted',
  Unidentified: 'unidentified',
  Mirrored: 'mirrored',
  Sanctified: 'sanctified',
  Unmodifiable: 'unmodifiable',
  'Fractured Item': 'fractured',
}

/** Lines that are game help text, not data. Kept out of `unparsed`. */
const DESCRIPTION_PATTERNS = [
  /^Can be used in/,
  /^Right [Cc]lick/,
  /^Place into/,
  /^Shift click/i,
  /^Travel to/,
  /^Take this item/,
  /^Waystones can only be used once/,
  /^Use the Map Device/,
  /^Combine/,
  /^Socket/,
  /^This item can be/,
  /^Can only be/,
  /^Used to/,
  /^Unlock/,
  /^Item is/,
]

export function parseItem(text: string): ParsedItem {
  const item: ParsedItem = {
    itemClass: '',
    rarity: '',
    typeLine: '',
    kind: 'other',
    properties: [],
    mods: [],
    flags: {
      corrupted: false,
      twiceCorrupted: false,
      unidentified: false,
      mirrored: false,
      sanctified: false,
      fractured: false,
      unmodifiable: false,
    },
    advanced: false,
    unparsed: [],
  }
  try {
    parseInto(item, text)
  } catch (e) {
    item.unparsed.push(`(parser error: ${e instanceof Error ? e.message : String(e)})`)
  }
  return item
}

function parseInto(item: ParsedItem, text: string): void {
  const sections = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd())
    .reduce<string[][]>(
      (acc, line) => {
        if (line === SEPARATOR) acc.push([])
        else if (line !== '') acc[acc.length - 1].push(line)
        return acc
      },
      [[]],
    )
    .filter((s) => s.length)

  parseHeader(item, sections.shift() ?? [])
  item.kind = classify(item)

  for (const section of sections) parseSection(item, section)

  if (item.kind === 'waystone') {
    const tier = /\(Tier (\d+)\)/.exec(item.typeLine)?.[1]
    if (tier) item.waystone = { tier: Number(tier) }
  }
  if (item.kind === 'tablet') parseTablet(item)
}

function parseHeader(item: ParsedItem, lines: string[]): void {
  const rest: string[] = []
  for (const line of lines) {
    if (line.startsWith('Item Class: ')) item.itemClass = line.slice(12)
    else if (line.startsWith('Rarity: ')) item.rarity = line.slice(8)
    else rest.push(line)
  }
  if (rest.length >= 2) {
    item.name = rest[0]
    item.typeLine = rest[1]
  } else {
    item.typeLine = rest[0] ?? ''
  }
}

function classify(item: ParsedItem): ItemKind {
  const cls = item.itemClass
  if (cls === 'Waystones') return 'waystone'
  if (cls === 'Tablet' || cls === 'Tablets') return item.rarity === 'Unique' ? 'unique' : 'tablet'
  if (item.rarity === 'Unique') return 'unique'
  if (item.rarity === 'Gem' || NON_GEAR_CLASSES.has(cls)) return 'gem'
  if (item.rarity === 'Currency' || COMMODITY_CLASSES.has(cls)) return 'commodity'
  if (['Normal', 'Magic', 'Rare'].includes(item.rarity)) return 'gear'
  return 'other'
}

function parseSection(item: ParsedItem, lines: string[]): void {
  // Single-line markers.
  if (lines.length === 1) {
    const flag = FLAG_LINES[lines[0]]
    if (flag) {
      item.flags[flag] = true
      if (flag === 'twiceCorrupted') item.flags.corrupted = true
      return
    }
    if (lines[0].startsWith('Note: ')) {
      item.note = lines[0].slice(6)
      return
    }
  }

  if (lines.some(isModHeaderLine)) {
    item.advanced = true
    parseAdvancedMods(item, lines)
    return
  }

  if (lines[0].startsWith('Requires') || lines[0] === 'Requirements:') {
    parseRequirements(item, lines)
    return
  }

  let consumed = 0
  const leftovers: string[] = []
  for (const line of lines) {
    if (parseKnownLine(item, line)) consumed++
    else leftovers.push(line)
  }
  if (!leftovers.length) return

  if (leftovers.every(isDescription)) return

  // Simple-format (no Alt) mod lines, or flavour text on uniques.
  if (consumed === 0 && !item.advanced) {
    const mods = parseSimpleMods(leftovers, item)
    if (mods) {
      item.mods.push(...mods)
      return
    }
  }
  if (item.kind === 'unique' && consumed === 0) return // flavour text
  item.unparsed.push(...leftovers.filter((l) => !isDescription(l)))
}

/** Lines like "Item Level: 80", "Quality: +20% (augmented)", "Pack Size: +34% (augmented)". */
function parseKnownLine(item: ParsedItem, line: string): boolean {
  let m: RegExpExecArray | null
  if ((m = /^Item Level: (\d+)/.exec(line))) {
    item.itemLevel = Number(m[1])
    return true
  }
  if ((m = /^Stack Size: ([\d,.\s]+?)(?:\/([\d,.\s]+))?$/.exec(line))) {
    item.stack = { current: toInt(m[1]) }
    if (m[2]) item.stack.max = toInt(m[2])
    return true
  }
  if ((m = /^Sockets: (.+)$/.exec(line))) {
    item.sockets = m[1]
    return true
  }
  if ((m = /^([A-Z][A-Za-z' ]+?): (.+?)( \(augmented\))?$/.exec(line))) {
    const value = m[2].replace(/ \((?:unmet|augmented)\)/g, '')
    const num = /[+-]?\d+(?:\.\d+)?/.exec(value)
    const prop: HeaderProperty = {
      key: m[1],
      value,
      augmented: m[3] !== undefined || /\(augmented\)/.test(m[2]),
    }
    if (num) prop.number = Number(num[0])
    item.properties.push(prop)
    if (m[1] === 'Quality' && num) item.quality = Number(num[0])
    return true
  }
  return false
}

function parseRequirements(item: ParsedItem, lines: string[]): void {
  const text = lines
    .join(', ')
    .replace(/^Requires:?\s*/, '')
    .replace(/^Requirements:,?\s*/, '')
  const req: NonNullable<ParsedItem['requirements']> = {}
  for (const part of text.split(',').map((p) => p.trim())) {
    const clean = part.replace(/ \((?:unmet|augmented)\)/g, '')
    let m: RegExpExecArray | null
    if ((m = /^Level:? (\d+)/.exec(clean))) req.level = Number(m[1])
    else if (
      (m = /^(\d+) (Str|Dex|Int)/.exec(clean)) ||
      (m = /^(Str|Dex|Int)\w*:? (\d+)/.exec(clean))
    ) {
      const [num, attr] = /^\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]]
      req[attr.toLowerCase() as 'str' | 'dex' | 'int'] = Number(num)
    }
  }
  item.requirements = req
}

function parseAdvancedMods(item: ParsedItem, lines: string[]): void {
  let current: ParsedMod | undefined
  for (const line of lines) {
    if (isModHeaderLine(line)) {
      current = { ...parseModHeader(line), lines: [] }
      item.mods.push(current)
    } else if (current) {
      const { line: clean, type } = splitTypeSuffix(line)
      if (type && current.lines.length === 0) current.type = type
      current.lines.push(parseStatLine(clean))
    } else {
      item.unparsed.push(line)
    }
  }
}

/** Without Alt there are no headers: each line is its own mod, typed by its suffix. */
function parseSimpleMods(lines: string[], item: ParsedItem): ParsedMod[] | null {
  const statLike = lines.filter((l) => /\d|^[A-Z]/.test(l))
  if (statLike.length !== lines.length) return null
  const before = item.mods.length
  return lines.map((raw) => {
    const { line, type } = splitTypeSuffix(raw)
    return {
      type: type ?? (before === 0 && item.kind === 'tablet' ? 'implicit' : 'explicit'),
      tags: [],
      lines: [parseStatLine(line)],
    }
  })
}

function parseTablet(item: ParsedItem): void {
  const tablet: NonNullable<ParsedItem['tablet']> = {}
  for (const mod of item.mods) {
    if (mod.type !== 'implicit') continue
    mod.lines = mod.lines.filter((l) => {
      const uses = /^(\d+) uses? remaining$/.exec(l.text)
      if (uses) {
        tablet.usesRemaining = Number(uses[1])
        return false
      }
      if (/ to a Map$|^Adds /.test(l.text) && !tablet.mechanic) tablet.mechanic = l.text
      return true
    })
  }
  item.tablet = tablet
}

function isDescription(line: string): boolean {
  return DESCRIPTION_PATTERNS.some((p) => p.test(line))
}

function toInt(s: string): number {
  return Number(s.replace(/[,.\s]/g, ''))
}
