import { defineStore } from 'pinia'
import { ref } from 'vue'
import { defaultSettings, type Settings, type SettingsPatch } from '../../shared/settings'
import { api } from '../bridge'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings>(defaultSettings())
  let started = false

  async function init(): Promise<void> {
    if (started) return
    started = true
    api.on('settings-changed', (s) => (settings.value = s))
    settings.value = await api.invoke('settings:get')
  }

  async function update(patch: SettingsPatch): Promise<Settings> {
    settings.value = await api.invoke('settings:update', patch)
    return settings.value
  }

  return { settings, init, update }
})
