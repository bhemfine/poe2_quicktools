<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ data: Array<number | null>; width?: number; height?: number }>()

const w = computed(() => props.width ?? 96)
const h = computed(() => props.height ?? 24)

const path = computed(() => {
  const pts = props.data
    .map((v, i) => ({ i, v }))
    .filter((p): p is { i: number; v: number } => p.v !== null)
  if (pts.length < 2) return ''
  const vals = pts.map((p) => p.v)
  const min = Math.min(...vals, 0)
  const max = Math.max(...vals, 0)
  const span = max - min || 1
  const step = w.value / Math.max(1, props.data.length - 1)
  return pts
    .map(
      (p, k) =>
        `${k ? 'L' : 'M'}${(p.i * step).toFixed(1)},${(h.value - ((p.v - min) / span) * h.value).toFixed(1)}`,
    )
    .join(' ')
})
const up = computed(() => {
  const last = [...props.data].reverse().find((v) => v !== null)
  return (last ?? 0) >= 0
})
</script>

<template>
  <svg :width="w" :height="h" :viewBox="`0 0 ${w} ${h}`" role="img" aria-label="7-day price trend">
    <path
      v-if="path"
      :d="path"
      fill="none"
      :stroke="up ? '#4ade80' : '#f87171'"
      stroke-width="1.5"
    />
  </svg>
</template>
