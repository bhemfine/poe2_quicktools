<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { placeCard, type Point } from '../../shared/geometry'

const props = defineProps<{ anchor: Point; scale: number }>()

const el = ref<HTMLElement | null>(null)
const pos = ref<Point>({ x: -9999, y: -9999 })
let observer: ResizeObserver | undefined

/** Re-place whenever the card or the window changes size (window = game client area). */
function layout(): void {
  if (!el.value) return
  const rect = el.value.getBoundingClientRect()
  pos.value = placeCard(
    props.anchor,
    { width: rect.width, height: rect.height },
    { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
  )
}

onMounted(() => {
  observer = new ResizeObserver(layout)
  if (el.value) observer.observe(el.value)
  window.addEventListener('resize', layout)
  void nextTick(layout)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', layout)
})
watch(
  () => [props.anchor.x, props.anchor.y, props.scale],
  () => void nextTick(layout),
)
</script>

<template>
  <div
    ref="el"
    data-capture
    class="fixed top-0 left-0"
    :style="{ transform: `translate(${pos.x}px, ${pos.y}px)` }"
  >
    <div :style="{ zoom: scale / 100 }">
      <slot />
    </div>
  </div>
</template>
