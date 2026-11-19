// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
;(globalThis as unknown as { window: { quicktools: unknown } }).window.quicktools = {
  invoke: async () => undefined,
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
})
