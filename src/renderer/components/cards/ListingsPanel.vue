<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { formatAmount } from '../../../shared/pricing/ninja'
import type { SearchState } from '../../composables/useTradeSearch'
import { api } from '../../bridge'
import { useEconomyStore } from '../../stores/economy'

const props = defineProps<{ state: SearchState }>()
const economy = useEconomyStore()
const copied = ref<string | null>(null)
const now = ref(Date.now())
const timer = setInterval(() => (now.value = Date.now()), 1000)
onBeforeUnmount(() => clearInterval(timer))

const countdown = computed(() =>
  props.state.error?.until
    ? Math.max(0, Math.ceil((props.state.error.until - now.value) / 1000))
    : 0,
)

async function copyWhisper(id: string, whisper?: string): Promise<void> {
  if (!whisper) return
  // Whispers only go to the clipboard; QuickTools never sends chat (PLAN §1.4).
  await api.invoke('clipboard:write', whisper)
  copied.value = id
}
</script>

<template>
  <div class="space-y-1 text-xs">
    <div v-if="state.loading" class="text-neutral-400">Searching…</div>
    <div v-else-if="state.error" class="text-red-300">
      {{ state.error.message }}<span v-if="countdown"> ({{ countdown }} s)</span>
    </div>
    <template v-else-if="state.total !== null">
      <div class="text-neutral-400">
        {{ state.total }} listed
        <a
          v-if="state.tradeUrl"
          :href="state.tradeUrl"
          target="_blank"
          class="ml-1 text-sky-400 underline"
          >Open on trade site</a
        >
      </div>
      <table v-if="state.listings.length" class="w-full">
        <tbody>
          <tr v-for="l in state.listings" :key="l.id" class="border-t border-neutral-800">
            <td class="pr-1 whitespace-nowrap">
              {{ l.amount !== undefined ? formatAmount(l.amount) : '?' }}
              <span class="text-neutral-400">{{ l.currency }}</span>
            </td>
            <td class="pr-1 whitespace-nowrap text-amber-200">
              <template v-if="l.divine !== undefined">{{ formatAmount(l.divine) }} div</template>
            </td>
            <td class="w-full truncate" :class="l.online ? 'text-green-400' : 'text-neutral-500'">
              {{ l.online ? '●' : '○' }} {{ l.account }}
            </td>
            <td>
              <button
                v-if="l.whisper"
                type="button"
                class="rounded bg-neutral-700 px-1 hover:bg-neutral-600"
                @click="copyWhisper(l.id, l.whisper)"
              >
                {{ copied === l.id ? 'Copied' : 'Whisper' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!economy.prices" class="text-neutral-500">
        Divine values appear once poe.ninja prices load.
      </div>
    </template>
  </div>
</template>
