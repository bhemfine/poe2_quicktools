<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useEconomyStore } from '../stores/economy'

const economy = useEconomyStore()
const now = ref(Date.now())
const timer = setInterval(() => (now.value = Date.now()), 1000)
onBeforeUnmount(() => clearInterval(timer))

const LABELS: Record<string, string> = {
  'trade-search-request-limit': 'Searches',
  'trade-fetch-request-limit': 'Fetches',
}

function period(s: number): string {
  return s >= 3600 ? `${s / 3600} h` : s >= 60 ? `${s / 60} min` : `${s} s`
}

const rows = computed(() =>
  economy.rateLimits
    .filter((p) => LABELS[p.policy])
    .map((p) => ({
      label: LABELS[p.policy],
      // The two shortest windows are the ones a user can actually hit.
      windows: p.windows
        .slice(0, 2)
        .map((w) => `${w.used}/${w.limit} per ${period(w.period)}`)
        .join(' · '),
      lockedFor: p.restrictedUntil
        ? Math.max(0, Math.ceil((p.restrictedUntil - now.value) / 1000))
        : 0,
      near: p.windows.some((w) => w.used >= w.limit - 1),
    })),
)
</script>

<template>
  <div class="space-y-0.5 text-[11px] text-neutral-400">
    <div
      v-for="r in rows"
      :key="r.label"
      :class="r.lockedFor ? 'text-red-300' : r.near ? 'text-amber-300' : ''"
    >
      {{ r.label }}: {{ r.windows }}
      <span v-if="r.lockedFor"> — paused {{ r.lockedFor }} s</span>
    </div>
  </div>
</template>
