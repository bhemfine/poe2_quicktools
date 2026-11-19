// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { defaultSettings, type SettingsPatch } from '../../src/shared/settings'

const updates: SettingsPatch[] = []
;(globalThis as unknown as { window: { quicktools: unknown } }).window.quicktools = {
  invoke: async (channel: string, patch?: SettingsPatch) => {
    if (channel !== 'settings:update' || !patch) return undefined
    updates.push(patch)
    return { ...defaultSettings(), ...patch }
  },
  on: () => () => {},
}
const { useSettingsStore } = await import('../../src/renderer/stores/settings')
const CheatSheet = (await import('../../src/renderer/components/CheatSheet.vue')).default

describe('hotkey cheat sheet', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('lists the current bindings as keycaps', () => {
    const w = mount(CheatSheet)
    const text = w.text()
    expect(text).toContain('Price check')
    expect(text).toContain('Hide this list')
    expect(w.findAll('kbd').map((k) => k.text())).toEqual(
      expect.arrayContaining(['Ctrl', 'D', 'F4', 'Esc', 'H']),
    )
    expect(text).not.toContain('Save last item text')
  })

  it('follows rebinds, drops unbound actions and moves to the chosen side', async () => {
    const settings = useSettingsStore()
    settings.settings = {
      ...settings.settings,
      hotkeys: { ...settings.settings.hotkeys, 'price-check': 'F2', 'open-ninja': '' },
      cheatSheetPosition: 'top-right',
    }
    const w = mount(CheatSheet)
    expect(w.text()).not.toContain('Open on poe.ninja')
    expect(w.findAll('li')[0].text()).toBe('F2')
    expect(w.find('aside').classes()).toContain('right-3')
  })

  it('is click-through normally and draggable in mouse mode, saving the spot', async () => {
    const still = mount(CheatSheet)
    expect(still.find('aside').classes()).toContain('pointer-events-none')
    await still.find('aside').trigger('pointerdown', { clientX: 5, clientY: 5, pointerId: 1 })
    await still.find('aside').trigger('pointerup', { pointerId: 1 })
    expect(updates).toHaveLength(0)

    const w = mount(CheatSheet, { props: { draggable: true } })
    const aside = w.find('aside')
    expect(aside.classes()).toContain('pointer-events-auto')
    expect(w.text()).toContain('Drag to move')
    await aside.trigger('pointerdown', { clientX: 20, clientY: 300, pointerId: 1 })
    await aside.trigger('pointermove', { clientX: 520, clientY: 400, pointerId: 1 })
    await aside.trigger('pointerup', { pointerId: 1 })
    await flushPromises()
    const saved = updates.at(-1)!
    expect(saved.cheatSheetPosition).toBe('custom')
    expect(saved.cheatSheetOffset!.x).toBeCloseTo(500 / window.innerWidth)
    expect(saved.cheatSheetOffset!.y).toBeCloseTo(100 / window.innerHeight)
    // Follows the saved spot afterwards.
    expect(aside.attributes('style')).toContain('left:')
  })
})
