// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import gameBinds from '../../config/poe2-default-binds.json'
import { DEFAULT_HOTKEYS } from '../../src/shared/hotkeys/actions'

const available = { value: true }
;(globalThis as unknown as { window: { quicktools: unknown } }).window.quicktools = {
  invoke: vi.fn(async (channel: string) =>
    channel === 'hotkeys:is-available' ? available.value : undefined,
  ),
  on: () => () => {},
}
const HotkeyRecorder = (await import('../../src/renderer/components/settings/HotkeyRecorder.vue'))
  .default

function mountRecorder(action: keyof typeof DEFAULT_HOTKEYS = 'pin-card') {
  return mount(HotkeyRecorder, {
    props: {
      action,
      bindings: { ...DEFAULT_HOTKEYS },
      defaultCombo: DEFAULT_HOTKEYS[action],
      gameBinds: gameBinds.binds,
      wasdMode: false,
    },
  })
}

function press(init: KeyboardEventInit): void {
  window.dispatchEvent(new KeyboardEvent('keydown', init))
}

describe('hotkey recorder', () => {
  beforeEach(() => (available.value = true))

  it('captures a free combo and saves it immediately', async () => {
    const w = mountRecorder()
    await w.find('button').trigger('click')
    expect(w.text()).toContain('Press keys')
    press({ code: 'ShiftLeft', key: 'Shift', shiftKey: true })
    press({ code: 'KeyK', key: 'K', ctrlKey: true, shiftKey: true })
    await flushPromises()
    expect(w.emitted('save')).toEqual([['Ctrl + Shift + K']])
  })

  it('Backspace clears and Esc cancels', async () => {
    const w = mountRecorder()
    await w.find('button').trigger('click')
    press({ code: 'Backspace', key: 'Backspace' })
    await flushPromises()
    expect(w.emitted('save')).toEqual([['']])

    await w.find('button').trigger('click')
    press({ code: 'Escape', key: 'Escape' })
    await flushPromises()
    expect(w.emitted('save')).toHaveLength(1)
    expect(w.text()).not.toContain('Press keys')
  })

  it('blocks a duplicate of another QuickTools action', async () => {
    const w = mountRecorder()
    await w.find('button').trigger('click')
    press({ code: 'KeyD', key: 'd', ctrlKey: true })
    await flushPromises()
    expect(w.text()).toContain('Already used by "Price check')
    expect(w.text()).not.toContain('Use anyway')
    expect(w.emitted('save')).toBeUndefined()
  })

  it('warns on a PoE 2 default bind but lets the user accept', async () => {
    const w = mountRecorder()
    await w.find('button').trigger('click')
    press({ code: 'KeyQ', key: 'q', ctrlKey: true })
    await flushPromises()
    expect(w.text()).toContain('Secondary skill slot Q')
    await w
      .findAll('button')
      .find((b) => b.text() === 'Use anyway')!
      .trigger('click')
    expect(w.emitted('save')).toEqual([['Ctrl + Q']])
  })

  it('reports a combo taken by another program', async () => {
    available.value = false
    const w = mountRecorder()
    await w.find('button').trigger('click')
    press({ code: 'KeyJ', key: 'j', ctrlKey: true, altKey: true })
    await flushPromises()
    expect(w.text()).toContain('In use by another program')
    expect(w.emitted('save')).toBeUndefined()
  })

  it('shows registration errors from main and offers Reset', async () => {
    const w = mount(HotkeyRecorder, {
      props: {
        action: 'price-check',
        bindings: { ...DEFAULT_HOTKEYS, 'price-check': 'Ctrl + Shift + Q' },
        defaultCombo: DEFAULT_HOTKEYS['price-check'],
        gameBinds: gameBinds.binds,
        wasdMode: false,
        registerError: 'Could not register: in use by another program.',
      },
    })
    expect(w.text()).toContain('Could not register')
    await w
      .findAll('button')
      .find((b) => b.text() === 'Reset')!
      .trigger('click')
    expect(w.emitted('save')).toEqual([['Ctrl + D']])
  })
})
