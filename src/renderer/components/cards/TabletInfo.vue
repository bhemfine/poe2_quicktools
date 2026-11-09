<script setup lang="ts">
import type { ParsedItem } from '../../../shared/parser/types'

defineProps<{ item: ParsedItem }>()
</script>

<template>
  <div class="space-y-0.5 text-xs text-neutral-300">
    <div v-if="item.tablet?.mechanic">{{ item.tablet.mechanic }}</div>
    <div v-if="item.tablet?.usesRemaining !== undefined">
      {{ item.tablet.usesRemaining }} uses remaining
    </div>
    <!-- Only the verified rule is shown (PLAN §2.2); other slot thresholds are unconfirmed. -->
    <div class="text-[11px] text-neutral-500">
      Goes in the Map Device (up to 3 tablets). A waystone with 6 mods enables all 3 slots.
    </div>
  </div>
</template>
