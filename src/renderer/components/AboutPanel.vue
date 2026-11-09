<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { AppInfo } from '../../shared/ipc'
import { GGG_NOTICE } from '../../shared/notices'
import thirdPartyNotices from '../../../THIRD_PARTY_NOTICES.md?raw'

const info = ref<AppInfo | null>(null)
const showNotices = ref(false)

onMounted(async () => {
  info.value = await window.quicktools.invoke('app:get-info')
})
</script>

<template>
  <section class="rounded-lg border border-neutral-700 p-4">
    <h2 class="text-lg font-medium">About</h2>
    <dl class="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
      <dt class="text-neutral-400">Version</dt>
      <dd>{{ info?.version ?? '…' }}</dd>
      <dt class="text-neutral-400">User-Agent</dt>
      <dd class="font-mono text-xs break-all">{{ info?.userAgent ?? '…' }}</dd>
    </dl>
    <p class="mt-3 text-sm text-amber-300">{{ GGG_NOTICE }}</p>
    <button
      type="button"
      class="mt-3 text-sm text-sky-400 underline"
      @click="showNotices = !showNotices"
    >
      {{ showNotices ? 'Hide' : 'Show' }} third-party notices
    </button>
    <pre
      v-if="showNotices"
      class="mt-2 max-h-64 overflow-auto rounded bg-neutral-800 p-3 text-xs whitespace-pre-wrap"
      >{{ thirdPartyNotices }}</pre>
  </section>
</template>
