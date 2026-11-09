import type { StatLine } from './types'

const UNSCALABLE = ' — Unscalable Value'
const NUM = String.raw`[+-]?\d+(?:\.\d+)?`
/** "143(124-151)" or "-1.95(-2--1.9)" — a roll with its range. */
const ROLL_WITH_RANGE = new RegExp(String.raw`(${NUM})\((${NUM})-(${NUM})\)`, 'g')
const NUMBER = new RegExp(NUM, 'g')

/** Removes trade/wiki markup: "[EnergyShield|Energy Shield]" → "Energy Shield", "[Resistances]" → "Resistances". */
export function stripMarkup(text: string): string {
  return text.replace(/\[([^\]|]+)\|([^\]]+)\]/g, '$2').replace(/\[([^\]|]+)\]/g, '$1')
}

/** Parses one stat line of an item, keeping rolled values and their ranges. */
export function parseStatLine(raw: string): StatLine {
  let line = stripMarkup(raw)
  let unscalable = false
  if (line.endsWith(UNSCALABLE)) {
    unscalable = true
    line = line.slice(0, -UNSCALABLE.length)
  }

  const values: number[] = []
  const ranges: StatLine['ranges'] = []
  // Pass 1: rolls that carry a range.
  const withRanges = new Map<number, [number, number]>()
  let collapsed = ''
  let last = 0
  for (const m of line.matchAll(ROLL_WITH_RANGE)) {
    collapsed += line.slice(last, m.index) + m[1]
    const a = Number(m[2])
    const b = Number(m[3])
    withRanges.set(collapsed.length - m[1].length, a <= b ? [a, b] : [b, a])
    last = m.index! + m[0].length
  }
  collapsed += line.slice(last)

  // Pass 2: every number in the collapsed text, in order.
  for (const m of collapsed.matchAll(NUMBER)) {
    // Skip digits glued to letters ("Tier3", "x2" style names are not values).
    const before = collapsed[m.index! - 1]
    if (before && /[A-Za-z]/.test(before)) continue
    values.push(Number(m[0]))
    ranges.push(withRanges.get(m.index!) ?? null)
  }

  return { text: collapsed, raw, values, ranges, unscalable }
}

/**
 * Turns a stat line into the template the trade API uses: numbers become "#", a leading "+" is
 * dropped ("+12 to Strength" → "# to Strength").
 */
export function toTemplate(text: string): string {
  return stripMarkup(text)
    .replace(/[+-]?\d+(?:\.\d+)?/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
}
