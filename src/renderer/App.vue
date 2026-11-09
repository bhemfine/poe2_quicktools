<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

const route = location.hash === '#overlay' ? 'overlay' : 'settings'
document.documentElement.classList.add(`route-${route}`)

const OverlayApp = defineAsyncComponent(() => import('./overlay/OverlayApp.vue'))
const SettingsApp = defineAsyncComponent(() => import('./settings/SettingsApp.vue'))
</script>

<template>
  <OverlayApp v-if="route === 'overlay'" />
  <SettingsApp v-else />
</template>
