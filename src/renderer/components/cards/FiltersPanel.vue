<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PriceCheckModel, StatFilter } from '../../../shared/query/model'
import { useEconomyStore } from '../../stores/economy'

const model = defineModel<PriceCheckModel>({ required: true })
defineEmits<{ search: [] }>()
const economy = useEconomyStore()

const query = ref('')
const results = computed(() =>
  query.value.trim().length >= 2 ? (economy.matcher?.search(query.value, 12) ?? []) : [],
)

function addStat(id: string, text: string): void {
  const f: StatFilter = { id, text, itemText: '', enabled: true, mode: 'and' }
  model.value.stats.push(f)
  query.value = ''
}

function num(v: string): number | undefined {
  const n = Number(v)
  return v.trim() === '' || !Number.isFinite(n) ? undefined : n
}

const MOD_BADGE: Record<string, string> = {
  implicit: 'imp',
  rune: 'rune',
  desecrated: 'des',
  fractured: 'frac',
  crafted: 'craft',
  enchant: 'ench',
  corrupted: 'corr',
}
</script>

<template>
  <div class="space-y-1 text-xs">
    <label
      v-if="model.kind === 'gear' && model.category"
      class="flex items-center gap-1 text-neutral-300"
    >
      <input v-model="model.useBaseType" type="checkbox" /> Search by base type ({{ model.type }})
    </label>

    <div v-for="p in model.props" :key="p.group + p.id" class="flex items-center gap-1">
      <input v-model="p.enabled" type="checkbox" :aria-label="p.label" />
      <span class="flex-1 truncate" :class="p.enabled ? '' : 'text-neutral-500'">
        {{ p.label }}
        <span v-if="p.option !== undefined" class="text-neutral-400"
          >: {{ p.option === 'true' ? 'Yes' : 'No' }}</span
        >
        <span v-else-if="p.value !== undefined" class="text-neutral-400">({{ p.value }})</span>
      </span>
      <template v-if="p.option === undefined">
        <input
          class="w-12 rounded bg-neutral-800 px-1"
          :value="p.min ?? ''"
          placeholder="min"
          @change="p.min = num(($event.target as HTMLInputElement).value)"
        />
        <input
          class="w-12 rounded bg-neutral-800 px-1"
          :value="p.max ?? ''"
          placeholder="max"
          @change="p.max = num(($event.target as HTMLInputElement).value)"
        />
      </template>
    </div>

    <div v-if="model.props.length && model.stats.length" class="border-t border-neutral-700" />

    <div
      v-for="(s, i) in model.stats"
      :key="s.id + i"
      class="flex items-center gap-1"
      :class="s.jackpot ? 'rounded bg-amber-900/40' : ''"
    >
      <input v-model="s.enabled" type="checkbox" :aria-label="s.itemText || s.text" />
      <button
        type="button"
        class="w-8 rounded px-0.5 text-[10px]"
        :class="s.mode === 'not' ? 'bg-red-900 text-red-200' : 'bg-neutral-700 text-neutral-300'"
        :title="s.mode === 'not' ? 'Exclude listings with this mod' : 'Require this mod'"
        @click="s.mode = s.mode === 'not' ? 'and' : 'not'"
      >
        {{ s.mode === 'not' ? 'NOT' : 'AND' }}
      </button>
      <span class="flex-1 truncate" :class="s.enabled ? '' : 'text-neutral-500'" :title="s.text">
        <span v-if="s.modType && MOD_BADGE[s.modType]" class="mr-1 text-[10px] text-sky-300">{{
          MOD_BADGE[s.modType]
        }}</span>
        <span v-if="s.tier" class="mr-1 text-[10px] text-neutral-400">T{{ s.tier }}</span>
        {{ s.itemText || s.text }}
        <span v-if="s.jackpot" class="text-amber-300">★</span>
      </span>
      <template v-if="s.mode === 'and'">
        <input
          class="w-12 rounded bg-neutral-800 px-1"
          :value="s.min ?? ''"
          placeholder="min"
          @change="s.min = num(($event.target as HTMLInputElement).value)"
        />
        <input
          class="w-12 rounded bg-neutral-800 px-1"
          :value="s.max ?? ''"
          placeholder="max"
          @change="s.max = num(($event.target as HTMLInputElement).value)"
        />
      </template>
    </div>

    <p v-if="model.unmatched.length" class="text-amber-300" :title="model.unmatched.join('\n')">
      {{ model.unmatched.length }} line{{ model.unmatched.length === 1 ? '' : 's' }} not recognised
    </p>

    <div class="relative">
      <input
        v-model="query"
        class="w-full rounded bg-neutral-800 px-1 py-0.5"
        placeholder="+ Add stat (e.g. total resistance)"
      />
      <ul
        v-if="results.length"
        class="absolute z-10 mt-0.5 max-h-48 w-full overflow-auto rounded border border-neutral-600 bg-neutral-900"
      >
        <li v-for="r in results" :key="r.id">
          <button
            type="button"
            class="w-full px-1 text-left hover:bg-neutral-700"
            @click="addStat(r.id, r.text)"
          >
            <span class="text-[10px] text-sky-300">{{ r.type }}</span> {{ r.text }}
          </button>
        </li>
      </ul>
    </div>

    <div class="flex items-center gap-2 pt-1">
      <label class="flex items-center gap-1 text-neutral-300">
        <input v-model="model.onlineOnly" type="checkbox" /> Online only
      </label>
      <button
        type="button"
        class="ml-auto rounded bg-sky-700 px-2 py-0.5 text-white hover:bg-sky-600"
        @click="$emit('search')"
      >
        Search
      </button>
    </div>
  </div>
</template>
