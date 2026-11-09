import { describe, expect, it } from 'vitest'
import {
  displayForPhysicalRect,
  physicalToDipRect,
  placeCard,
  type DisplayInfo,
} from '../../src/shared/geometry'

const SCALES = [1, 1.25, 1.5, 1.75, 2, 2.25]

function display(
  dipX: number,
  dipY: number,
  w: number,
  h: number,
  nativeX: number,
  nativeY: number,
  s: number,
): DisplayInfo {
  return {
    bounds: { x: dipX, y: dipY, width: w, height: h },
    nativeOrigin: { x: nativeX, y: nativeY },
    scaleFactor: s,
  }
}

describe('physical → DIP', () => {
  it.each(SCALES)('single monitor at scale %s maps the full screen to DIP bounds', (s) => {
    const d = display(0, 0, 2560 / s, 1440 / s, 0, 0, s)
    const r = physicalToDipRect({ x: 0, y: 0, width: 2560, height: 1440 }, [d])
    expect(r.x).toBe(0)
    expect(r.y).toBe(0)
    expect(r.width).toBeCloseTo(2560 / s)
    expect(r.height).toBeCloseTo(1440 / s)
  })

  it.each(SCALES)('windowed game at scale %s keeps its offset', (s) => {
    const d = display(0, 0, 3840 / s, 2160 / s, 0, 0, s)
    const r = physicalToDipRect({ x: 300, y: 150, width: 1600, height: 900 }, [d])
    expect(r.x).toBeCloseTo(300 / s)
    expect(r.width).toBeCloseTo(1600 / s)
  })

  it('handles a secondary monitor left of the primary (negative coordinates)', () => {
    const primary = display(0, 0, 1920, 1080, 0, 0, 1)
    // 4K at 150% to the left: DIP 2560×1440, physical 3840×2160.
    const left = display(-2560, 0, 2560, 1440, -3840, 0, 1.5)
    const r = physicalToDipRect({ x: -3840, y: 0, width: 3840, height: 2160 }, [primary, left])
    expect(r).toEqual({ x: -2560, y: 0, width: 2560, height: 1440 })
  })

  it('handles a monitor above the primary', () => {
    const primary = display(0, 0, 2560, 1440, 0, 0, 1)
    const above = display(0, -1080, 1920, 1080, 0, -2160, 2)
    const r = physicalToDipRect({ x: 200, y: -2000, width: 1000, height: 600 }, [primary, above])
    expect(r).toEqual({ x: 100, y: -1080 + 80, width: 500, height: 300 })
  })

  it('mixed DPI: uses the display holding most of the window', () => {
    const a = display(0, 0, 1920, 1080, 0, 0, 1)
    const b = display(1920, 0, 1706.67, 960, 1920, 0, 1.5)
    // Mostly on B (x 1800..3400 physical).
    const rect = { x: 1800, y: 0, width: 1600, height: 900 }
    expect(displayForPhysicalRect(rect, [a, b])).toBe(b)
    const r = physicalToDipRect(rect, [a, b])
    expect(r.x).toBeCloseTo(1920 + (1800 - 1920) / 1.5)
    expect(r.width).toBeCloseTo(1600 / 1.5)
  })
})

describe('card placement', () => {
  const area = { x: 0, y: 0, width: 1280, height: 720 }
  const card = { width: 320, height: 400 }

  it('goes right/below the cursor by default', () => {
    expect(placeCard({ x: 100, y: 100 }, card, area)).toEqual({ x: 120, y: 120 })
  })

  it('flips left at the right edge', () => {
    expect(placeCard({ x: 1200, y: 100 }, card, area).x).toBe(1200 - 20 - 320)
  })

  it('flips up at the bottom edge', () => {
    expect(placeCard({ x: 100, y: 700 }, card, area).y).toBe(700 - 20 - 400)
  })

  it('clamps at the top and left edges', () => {
    // Flipping up would go above 0, so it clamps to the top.
    const p = placeCard({ x: 5, y: 380 }, { width: 320, height: 700 }, area)
    expect(p).toEqual({ x: 25, y: 0 })
  })

  it('never leaves an area that has a negative origin', () => {
    const neg = { x: -1920, y: -200, width: 1920, height: 1080 }
    for (const cursor of [
      { x: -1910, y: -190 },
      { x: -10, y: 870 },
      { x: -960, y: 340 },
    ]) {
      const p = placeCard(cursor, card, neg)
      expect(p.x).toBeGreaterThanOrEqual(neg.x)
      expect(p.y).toBeGreaterThanOrEqual(neg.y)
      expect(p.x + card.width).toBeLessThanOrEqual(neg.x + neg.width)
      expect(p.y + card.height).toBeLessThanOrEqual(neg.y + neg.height)
    }
  })

  it('pins a card bigger than the area to its top-left', () => {
    expect(placeCard({ x: 50, y: 50 }, { width: 2000, height: 2000 }, area)).toEqual({ x: 0, y: 0 })
  })
})
