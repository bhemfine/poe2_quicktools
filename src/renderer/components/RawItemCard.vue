<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '../bridge'

const props = defineProps<{ text: string; title?: string; message?: string }>()

const header = computed(() => {
  const lines = props.text.split(/\r?\n/)
  const sep = lines.indexOf('--------')
  const head = (sep === -1 ? lines : lines.slice(0, sep)).filter(Boolean)
  return {
    itemClass: head.find((l) => l.startsWith('Item Class: '))?.slice(12) ?? '?',
    rarity: head.find((l) => l.startsWith('Rarity: '))?.slice(8) ?? '?',
    names: head.filter((l) => !l.startsWith('Item Class: ') && !l.startsWith('Rarity: ')),
  }
})
const showRaw = ref(false)
const copied = ref(false)

async function copyForBugReport(): Promise<void> {
  await api.invoke('clipboard:write', props.text)
  copied.value = true
}
</script>

<template>
  <div class="qt-card w-80 p-3 text-sm">
    <div class="text-xs text-neutral-400">{{ header.itemClass }} · {{ header.rarity }}</div>
    <div v-for="n in header.names" :key="n" class="font-semibold">{{ n }}</div>
    <p v-if="message" class="mt-2 text-amber-300">{{ message }}</p>
    <div class="mt-2 flex gap-3 text-xs">
      <button type="button" class="text-sky-400 underline" @click="showRaw = !showRaw">
        {{ showRaw ? 'Hide' : 'Show' }} item text
      </button>
      <button type="button" class="text-sky-400 underline" @click="copyForBugReport">
        {{ copied ? 'Copied' : 'Copy item text for a bug report' }}
      </button>
    </div>
    <pre
      v-if="showRaw"
      class="mt-2 max-h-64 overflow-auto rounded bg-neutral-800 p-2 text-xs whitespace-pre-wrap"
      >{{ text }}</pre>
  </div>
</template>
