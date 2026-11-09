<script setup lang="ts">
import { computed } from 'vue'
import { useEconomyStore } from '../stores/economy'
import { useSettingsStore } from '../stores/settings'

/** `all` lists every league (Settings); otherwise only the auto-selection candidates. */
const props = defineProps<{ all?: boolean }>()
const economy = useEconomyStore()
const settingsStore = useSettingsStore()

const options = computed(() => (props.all ? economy.league?.all : economy.league?.candidates) ?? [])
const current = computed(() => economy.league?.league ?? '')

function pick(league: string): void {
  void settingsStore.update({ league: league || null })
}
</script>

<template>
  <div class="text-sm">
    <template v-if="!all">
      <p class="mb-1 text-neutral-300">More than one league is running. Which one do you play?</p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="l in options"
          :key="l"
          type="button"
          class="rounded bg-sky-700 px-2 py-0.5 text-white hover:bg-sky-600"
          @click="pick(l)"
        >
          {{ l }}
        </button>
      </div>
    </template>
    <select
      v-else
      class="rounded bg-neutral-800 px-1"
      :value="settingsStore.settings.league ?? ''"
      aria-label="League"
      @change="pick(($event.target as HTMLSelectElement).value)"
    >
      <option value="">
        Automatic{{ current && !settingsStore.settings.league ? ` (${current})` : '' }}
      </option>
      <option v-for="l in options" :key="l" :value="l">{{ l }}</option>
    </select>
  </div>
</template>
