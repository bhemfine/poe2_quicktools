/**
 * DPI-aware geometry helpers. All "DIP" values are Electron device-independent pixels;
 * "physical" values are Windows screen pixels (what electron-overlay-window reports).
 * Nothing here assumes the primary monitor sits at (0,0) or that there is one scale factor.
 */

export interface Point {
  x: number
  y: number
}
export interface Size {
  width: number
  height: number
}
export interface Rect extends Point, Size {}

export interface DisplayInfo {
  /** Display bounds in DIP. */
  bounds: Rect
  /** Top-left of the display in physical pixels (Electron `display.nativeOrigin`). */
  nativeOrigin: Point
  scaleFactor: number
}

export function physicalBounds(d: DisplayInfo): Rect {
  return {
    x: d.nativeOrigin.x,
    y: d.nativeOrigin.y,
    width: Math.round(d.bounds.width * d.scaleFactor),
    height: Math.round(d.bounds.height * d.scaleFactor),
  }
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/** The display holding most of a physical rect (Windows' rule for which DPI a window uses). */
export function displayForPhysicalRect(rect: Rect, displays: readonly DisplayInfo[]): DisplayInfo {
  if (!displays.length) throw new Error('No displays')
  let best = displays[0]
  let bestArea = -1
  for (const d of displays) {
    const area = overlapArea(rect, physicalBounds(d))
    if (area > bestArea) {
      best = d
      bestArea = area
    }
  }
  if (bestArea > 0) return best
  // Off-screen: fall back to the display whose physical origin is nearest.
  return displays.reduce((a, b) =>
    distSq(rect, physicalBounds(b)) < distSq(rect, physicalBounds(a)) ? b : a,
  )
}

function distSq(a: Point, b: Point): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2
}

/**
 * Physical → DIP, the same mapping `screen.screenToDipRect` does on Windows: the rect is scaled
 * by the factor of the display that holds most of it, relative to that display's origin.
 */
export function physicalToDipRect(rect: Rect, displays: readonly DisplayInfo[]): Rect {
  const d = displayForPhysicalRect(rect, displays)
  const s = d.scaleFactor
  return {
    x: d.bounds.x + (rect.x - d.nativeOrigin.x) / s,
    y: d.bounds.y + (rect.y - d.nativeOrigin.y) / s,
    width: rect.width / s,
    height: rect.height / s,
  }
}

export const CARD_OFFSET = 20

/**
 * Places a card next to the cursor inside `area` (both in the same DIP space, usually the overlay
 * window's client area). The card goes right/below the cursor, flips left/up when it would
 * overflow, and is clamped so it never leaves the area.
 */
export function placeCard(cursor: Point, card: Size, area: Rect, offset = CARD_OFFSET): Point {
  const right = area.x + area.width
  const bottom = area.y + area.height

  let x = cursor.x + offset
  if (x + card.width > right) x = cursor.x - offset - card.width
  let y = cursor.y + offset
  if (y + card.height > bottom) y = cursor.y - offset - card.height

  return {
    x: clamp(x, area.x, Math.max(area.x, right - card.width)),
    y: clamp(y, area.y, Math.max(area.y, bottom - card.height)),
  }
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

export function pointInRect(p: Point, r: Rect): boolean {
  return p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height
}

/** Cursor position relative to a window's top-left, both given in global DIP. */
export function toWindowSpace(globalDip: Point, windowBoundsDip: Rect): Point {
  return { x: globalDip.x - windowBoundsDip.x, y: globalDip.y - windowBoundsDip.y }
}
