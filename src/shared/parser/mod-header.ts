// Adapted from Exiled-Exchange-2 renderer/src/parser/advanced-mod-desc.ts @ cca30662 (MIT). Modified:
// English strings inlined, eldritch/scourge removed (not in PoE 2), unique and tablet mods added.
import type { ModType, ParsedMod } from './types'

const MODIFIER_LINE =
  /^(?<type>[^"]+?)(?:\s+"(?<name>[^"]*)")?(?:\s*\(Tier: (?<tier>\d+)\))?(?:\s*\(Rank: (?<rank>\d+)\))?$/

export function isModHeaderLine(line: string): boolean {
  return line.startsWith('{') && line.endsWith('}')
}

/** Parses `{ Prefix Modifier "Painful" (Tier: 1) — Damage, Chaos }`. */
export function parseModHeader(line: string): Omit<ParsedMod, 'lines'> {
  const [modText = '', tagsText] = line
    .slice(1, -1)
    .split('—')
    .map((s) => s.trim())

  const m = MODIFIER_LINE.exec(modText)
  let typeText = m?.groups?.type.trim() ?? modText
  let type: ModType = 'explicit'

  for (const [prefix, t] of [
    ['Fractured ', 'fractured'],
    ['Desecrated ', 'desecrated'],
    ['Crafted ', 'crafted'],
  ] as const) {
    if (typeText.startsWith(prefix)) {
      typeText = typeText.slice(prefix.length)
      type = t
    }
  }

  let generation: ParsedMod['generation']
  switch (typeText) {
    case 'Prefix Modifier':
      generation = 'prefix'
      break
    case 'Suffix Modifier':
      generation = 'suffix'
      break
    case 'Implicit Modifier':
      type = 'implicit'
      break
    case 'Corruption Enhancement':
    case 'Corrupted Implicit Modifier':
      type = 'corrupted'
      break
    case 'Enhancement':
      type = 'enchant'
      break
    // "Unique Modifier" stays explicit.
  }

  return {
    type,
    generation,
    name: m?.groups?.name || undefined,
    tier: Number(m?.groups?.tier) || undefined,
    tags: tagsText ? tagsText.split(',').map((t) => t.trim()) : [],
  }
}

const SUFFIX_TYPES: Array<[string, ModType]> = [
  [' (implicit)', 'implicit'],
  [' (enchant)', 'enchant'],
  [' (rune)', 'rune'],
  [' (added rune)', 'rune'],
  [' (desecrated)', 'desecrated'],
  [' (fractured)', 'fractured'],
  [' (crafted)', 'crafted'],
]

/** Simple-format lines carry their type as a suffix: "+10% to Fire Resistance (rune)". */
export function splitTypeSuffix(line: string): { line: string; type?: ModType } {
  for (const [suffix, type] of SUFFIX_TYPES) {
    if (line.endsWith(suffix)) return { line: line.slice(0, -suffix.length), type }
  }
  return { line }
}
