// Adapted from Exiled-Exchange-2 main/src/shortcuts/Shortcuts.ts (focus-gated registration) @ cca30662 (MIT). Modified.
import { EventEmitter } from 'node:events'
import { globalShortcut } from 'electron'
import {
  CONDITIONAL_ACTIONS,
  HOTKEY_ACTIONS,
  type HotkeyAction,
  type HotkeyBindings,
} from '../../shared/hotkeys/actions'
import { toAccelerator } from '../../shared/hotkeys/keys'
import type { HotkeyStatus } from '../../shared/ipc'
import type { Logger } from '../logging/logger'

interface Conditions {
  gameActive: boolean
  cardOpen: boolean
  devTools: boolean
}

/**
 * Registers QuickTools hotkeys with `globalShortcut` only while PoE 2 is the foreground window,
 * and unregisters them on blur so other apps get their keys back.
 */
export class HotkeyManager extends EventEmitter<{
  action: [HotkeyAction, string]
  status: [HotkeyStatus]
}> {
  private bindings: HotkeyBindings
  private registered = new Map<HotkeyAction, string>()
  private status: HotkeyStatus = {}
  private cond: Conditions = { gameActive: false, cardOpen: false, devTools: false }

  constructor(
    bindings: HotkeyBindings,
    private logger: Logger,
  ) {
    super()
    this.bindings = { ...bindings }
  }

  setBindings(bindings: HotkeyBindings): void {
    this.bindings = { ...bindings }
    this.unregisterAll()
    this.status = {}
    this.sync()
  }

  setConditions(patch: Partial<Conditions>): void {
    this.cond = { ...this.cond, ...patch }
    this.sync()
  }

  getStatus(): HotkeyStatus {
    return { ...this.status }
  }

  /**
   * True if `combo` can be registered right now (not taken by another program). Combos QuickTools
   * already holds count as available.
   */
  isAvailable(combo: string): boolean {
    const accel = toAccelerator(combo)
    if (!accel) return false
    if ([...this.registered.values()].includes(accel)) return true
    const ok = globalShortcut.register(accel, () => {})
    if (ok) globalShortcut.unregister(accel)
    return ok
  }

  private wanted(action: HotkeyAction): boolean {
    if (!this.cond.gameActive || !this.bindings[action]) return false
    const condition = CONDITIONAL_ACTIONS[action]
    if (condition === 'card-open') return this.cond.cardOpen
    if (condition === 'dev-tools') return this.cond.devTools
    return true
  }

  private sync(): void {
    let changed = false
    const seen = new Set<string>()
    for (const action of HOTKEY_ACTIONS) {
      const combo = this.bindings[action]
      const accel = combo ? toAccelerator(combo) : null
      const want = this.wanted(action) && accel !== null && !seen.has(accel)
      if (accel) seen.add(accel)
      const current = this.registered.get(action)

      if (!want && current) {
        globalShortcut.unregister(current)
        this.registered.delete(action)
      } else if (want && !current) {
        const ok = globalShortcut.register(accel!, () => this.emit('action', action, combo))
        if (ok) {
          this.registered.set(action, accel!)
          if (this.status[action]?.registered !== true) changed = true
          this.status[action] = { registered: true }
        } else {
          const error = 'Could not register: in use by another program.'
          if (this.status[action]?.error !== error) {
            this.logger.warn('hotkeys', `${action} (${combo}): ${error}`)
            changed = true
          }
          this.status[action] = { registered: false, error }
        }
      }
    }
    if (changed) this.emit('status', this.getStatus())
  }

  unregisterAll(): void {
    for (const accel of this.registered.values()) globalShortcut.unregister(accel)
    this.registered.clear()
  }
}
