import { EventEmitter } from 'node:events'
import Store from 'electron-store'
import {
  applySettingsPatch,
  migrateSettings,
  type Settings,
  type SettingsPatch,
} from '../../shared/settings'

/**
 * Settings persisted with electron-store (`settings.json` in userData). The file is read through
 * `migrateSettings`, so old, partial or hand-edited files load with defaults filled in.
 * Any future secret goes through Electron `safeStorage`, never into this file.
 */
export class SettingsStore extends EventEmitter<{ change: [Settings, Settings] }> {
  private store = new Store<{ settings: unknown }>({ name: 'settings', clearInvalidConfig: true })
  private current: Settings

  constructor() {
    super()
    this.current = migrateSettings(this.store.get('settings'))
    this.store.set('settings', this.current)
  }

  get(): Settings {
    return this.current
  }

  update(patch: SettingsPatch): Settings {
    const prev = this.current
    this.current = applySettingsPatch(prev, patch)
    this.store.set('settings', this.current)
    this.emit('change', this.current, prev)
    return this.current
  }

  get path(): string {
    return this.store.path
  }
}
