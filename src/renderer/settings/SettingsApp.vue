<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { DEFAULT_HOTKEYS, HOTKEY_ACTIONS, type HotkeyAction } from '../../shared/hotkeys/actions'
import type { GameBind } from '../../shared/hotkeys/conflicts'
import { displayCombo, normalizeCombo } from '../../shared/hotkeys/keys'
import type { HotkeyStatus, UpdateStatus } from '../../shared/ipc'
import { GGG_NOTICE } from '../../shared/notices'
import { CURRENCY_LABEL } from '../../shared/pricing/ninja'
import { BUNDLED_CONFIG, type RemoteConfig } from '../../shared/remote-config'
import type { CurrencyId } from '../../shared/settings'
import { api } from '../bridge'
import AboutPanel from '../components/AboutPanel.vue'
import LeaguePicker from '../components/LeaguePicker.vue'
import HotkeyRecorder from '../components/settings/HotkeyRecorder.vue'
import { useEconomyStore } from '../stores/economy'
import { useSettingsStore } from '../stores/settings'

const settingsStore = useSettingsStore()
const economy = useEconomyStore()
const s = computed(() => settingsStore.settings)
const status = ref<HotkeyStatus>({})
const remoteConfig = ref<RemoteConfig>(BUNDLED_CONFIG)
const update = ref<UpdateStatus>({ state: 'disabled', reason: '' })

const gameBinds = computed<GameBind[]>(() => [
  ...remoteConfig.value.gameBinds,
  ...s.value.customGameBinds,
])

onMounted(async () => {
  api.on('hotkeys-status', (st) => (status.value = st))
  api.on('remote-config', (c) => (remoteConfig.value = c))
  api.on('update-status', (u) => (update.value = u))
  await Promise.all([settingsStore.init(), economy.init()])
  ;[status.value, remoteConfig.value, update.value] = await Promise.all([
    api.invoke('hotkeys:get-status'),
    api.invoke('config:get'),
    api.invoke('update:get-status'),
  ])
})

const timeOf = (ms?: number) =>
  ms ? new Date(ms).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : ''

const updateText = computed(() => {
  const u = update.value
  switch (u.state) {
    case 'disabled':
      return u.reason ? `Off (${u.reason.toLowerCase()})` : 'Off'
    case 'checking':
      return 'Checking…'
    case 'up-to-date':
      return `Up to date (checked ${timeOf(u.checkedAt)})`
    case 'downloading':
      return `Downloading version ${u.version}… ${u.percent}%`
    case 'ready':
      return `Version ${u.version} is ready. It installs when you quit QuickTools.`
    case 'available':
      return `Version ${u.version} is available.`
    case 'error':
      return `Could not check: ${u.message}`
  }
  return ''
})

function saveHotkey(action: HotkeyAction, combo: string): void {
  void settingsStore.update({ hotkeys: { ...s.value.hotkeys, [action]: combo } })
}

function resetAll(): void {
  void settingsStore.update({ hotkeys: { ...DEFAULT_HOTKEYS } })
}

// Custom game binds (rebinds in PoE 2's options) so the recorder warns about them too.
const newBind = ref('')
const newBindLabel = ref('')
function addGameBind(): void {
  const combo = normalizeCombo(newBind.value)
  if (!combo) return
  void settingsStore.update({
    customGameBinds: [
      ...s.value.customGameBinds,
      { combo, action: newBindLabel.value || 'My PoE 2 bind' },
    ],
  })
  newBind.value = ''
  newBindLabel.value = ''
}
function removeGameBind(i: number): void {
  void settingsStore.update({ customGameBinds: s.value.customGameBinds.filter((_, k) => k !== i) })
}

function moveCurrency(i: number, dir: -1 | 1): void {
  const order = [...s.value.currencyOrder] as CurrencyId[]
  const j = i + dir
  if (j < 0 || j >= order.length) return
  ;[order[i], order[j]] = [order[j], order[i]]
  void settingsStore.update({ currencyOrder: order })
}

// Jackpot tablet mods
const jackpotQuery = ref('')
const jackpotResults = computed(() =>
  jackpotQuery.value.trim().length >= 2
    ? (economy.matcher
        ?.search(jackpotQuery.value, 15)
        .filter((r) => r.id.startsWith('explicit.')) ?? [])
    : [],
)
function addJackpot(id: string): void {
  if (!s.value.jackpotMods.includes(id)) {
    void settingsStore.update({ jackpotMods: [...s.value.jackpotMods, id] })
  }
  jackpotQuery.value = ''
}
function removeJackpot(id: string): void {
  void settingsStore.update({ jackpotMods: s.value.jackpotMods.filter((m) => m !== id) })
}
const statText = (id: string) => economy.matcher?.byId(id)?.text ?? id

const ninjaErrors = computed(() => Object.entries(economy.status.ninjaErrors))
</script>

<template>
  <main class="mx-auto max-w-3xl space-y-6 p-6 text-sm">
    <header>
      <h1 class="text-2xl font-semibold">PoE 2 QuickTools – Settings</h1>
      <p class="mt-1 text-amber-300">{{ GGG_NOTICE }}</p>
    </header>

    <section class="space-y-2">
      <h2 class="text-lg font-medium">League &amp; data</h2>
      <div class="flex items-center gap-3">
        <span class="text-neutral-400">League</span>
        <LeaguePicker all />
        <span v-if="economy.league?.needsPick" class="text-amber-300"
          >Choose a league to enable trade searches.</span
        >
      </div>
      <div class="text-neutral-400">
        Trade data: {{ economy.status.trade
        }}<span v-if="economy.status.tradeFetchedAt">
          (downloaded {{ timeOf(economy.status.tradeFetchedAt) }})</span
        ><span v-if="economy.status.tradeError"> – {{ economy.status.tradeError }}</span> ·
        poe.ninja: {{ economy.status.ninja
        }}<span v-if="economy.ninjaUpdated"> (updated {{ economy.ninjaUpdated }})</span>
        <button
          type="button"
          class="ml-2 text-sky-400 underline"
          @click="api.invoke('data:refresh')"
        >
          Refresh now
        </button>
      </div>
      <div class="text-xs text-neutral-500">
        Game lists:
        {{
          remoteConfig.source === 'online'
            ? `online copy (updated ${timeOf(remoteConfig.fetchedAt)})`
            : 'built-in copy'
        }}
      </div>
      <p
        v-if="economy.status.health"
        class="rounded border border-amber-700 bg-amber-950/40 p-2 text-amber-200"
      >
        ⚠ {{ economy.status.health }}
      </p>
      <ul v-if="ninjaErrors.length" class="text-xs text-amber-300">
        <li v-for="[type, msg] in ninjaErrors" :key="type">{{ type }}: {{ msg }}</li>
      </ul>
    </section>

    <section class="space-y-2">
      <h2 class="text-lg font-medium">Updates</h2>
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          :checked="s.checkForUpdates"
          @change="
            settingsStore.update({ checkForUpdates: ($event.target as HTMLInputElement).checked })
          "
        />
        Update QuickTools automatically
      </label>
      <div class="flex items-center gap-3 text-neutral-400">
        <span>{{ updateText }}</span>
        <button
          v-if="update.state === 'ready'"
          type="button"
          class="rounded bg-sky-700 px-2 text-white"
          @click="api.invoke('update:install')"
        >
          Restart now
        </button>
        <a
          v-else-if="update.state === 'available'"
          :href="update.url"
          target="_blank"
          class="text-sky-400 underline"
          >Download</a
        >
        <button
          v-else-if="update.state === 'up-to-date' || update.state === 'error'"
          type="button"
          class="text-sky-400 underline"
          @click="api.invoke('update:check')"
        >
          Check now
        </button>
      </div>
    </section>

    <section>
      <div class="flex items-center">
        <h2 class="text-lg font-medium">Hotkeys</h2>
        <button type="button" class="ml-auto text-sky-400 underline" @click="resetAll">
          Reset all to defaults
        </button>
      </div>
      <p class="text-xs text-neutral-400">
        Hotkeys only work while Path of Exile 2 is the focused window. Click a field and press the
        new combination.
      </p>
      <HotkeyRecorder
        v-for="a in HOTKEY_ACTIONS"
        :key="a"
        :action="a"
        :bindings="s.hotkeys"
        :default-combo="DEFAULT_HOTKEYS[a]"
        :game-binds="gameBinds"
        :wasd-mode="s.wasdMode"
        :register-error="status[a]?.error"
        @save="saveHotkey(a, $event)"
      />
      <label class="mt-2 flex items-center gap-2">
        <input
          type="checkbox"
          :checked="s.wasdMode"
          @change="settingsStore.update({ wasdMode: ($event.target as HTMLInputElement).checked })"
        />
        I play with WASD movement (warn about W, A, S, D)
      </label>
      <details class="mt-2">
        <summary class="cursor-pointer text-neutral-300">
          My PoE 2 key rebinds ({{ s.customGameBinds.length }})
        </summary>
        <ul class="mt-1 space-y-0.5">
          <li v-for="(b, i) in s.customGameBinds" :key="b.combo + i" class="flex gap-2">
            <span class="w-40 font-mono">{{ displayCombo(b.combo) }}</span
            ><span class="flex-1">{{ b.action }}</span>
            <button type="button" class="text-red-300" @click="removeGameBind(i)">Remove</button>
          </li>
        </ul>
        <div class="mt-1 flex gap-1">
          <input
            v-model="newBind"
            class="w-40 rounded bg-neutral-800 px-1"
            placeholder="e.g. Ctrl + G"
          />
          <input
            v-model="newBindLabel"
            class="flex-1 rounded bg-neutral-800 px-1"
            placeholder="What it does in game"
          />
          <button type="button" class="rounded bg-neutral-700 px-2" @click="addGameBind">
            Add
          </button>
        </div>
      </details>
    </section>

    <section class="space-y-2">
      <h2 class="text-lg font-medium">Copying items</h2>
      <label class="flex items-center gap-2">
        PoE 2 "Show Advanced Item Descriptions" key
        <select
          class="rounded bg-neutral-800 px-1"
          :value="s.advancedDescriptionsKey"
          @change="
            settingsStore.update({
              advancedDescriptionsKey: ($event.target as HTMLSelectElement).value,
            })
          "
        >
          <option v-for="k in ['Alt', 'Ctrl', 'Shift']" :key="k" :value="k">{{ k }}</option>
        </select>
      </label>
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          :checked="s.restoreClipboard"
          @change="
            settingsStore.update({ restoreClipboard: ($event.target as HTMLInputElement).checked })
          "
        />
        Restore my clipboard after a price check
      </label>
    </section>

    <section class="space-y-2">
      <h2 class="text-lg font-medium">Display</h2>
      <label class="flex items-center gap-2">
        UI scale
        <input
          type="range"
          min="75"
          max="150"
          step="5"
          :value="s.uiScale"
          @change="
            settingsStore.update({ uiScale: Number(($event.target as HTMLInputElement).value) })
          "
        />
        {{ s.uiScale }}%
      </label>
      <div>
        Currency order
        <ol class="mt-1 flex gap-2">
          <li
            v-for="(c, i) in s.currencyOrder"
            :key="c"
            class="flex items-center gap-1 rounded bg-neutral-800 px-2"
          >
            <button
              type="button"
              aria-label="Move left"
              :disabled="i === 0"
              @click="moveCurrency(i, -1)"
            >
              ‹
            </button>
            {{ CURRENCY_LABEL[c] }}
            <button
              type="button"
              aria-label="Move right"
              :disabled="i === s.currencyOrder.length - 1"
              @click="moveCurrency(i, 1)"
            >
              ›
            </button>
          </li>
        </ol>
      </div>
    </section>

    <section class="space-y-2">
      <h2 class="text-lg font-medium">Price check defaults</h2>
      <label class="flex items-center gap-2">
        Default minimum = item value minus
        <input
          type="number"
          min="0"
          max="100"
          class="w-16 rounded bg-neutral-800 px-1"
          :value="s.priceCheck.minRollPercent"
          @change="
            settingsStore.update({
              priceCheck: {
                ...s.priceCheck,
                minRollPercent: Number(($event.target as HTMLInputElement).value),
              },
            })
          "
        />
        %
      </label>
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          :checked="s.priceCheck.onlineOnly"
          @change="
            settingsStore.update({
              priceCheck: {
                ...s.priceCheck,
                onlineOnly: ($event.target as HTMLInputElement).checked,
              },
            })
          "
        />
        Only show sellers who are online
      </label>
    </section>

    <section class="space-y-2">
      <h2 class="text-lg font-medium">Jackpot tablet mods</h2>
      <p class="text-xs text-neutral-400">
        Mods you flag are highlighted with ★ and always included in tablet searches.
      </p>
      <ul class="space-y-0.5">
        <li v-for="id in s.jackpotMods" :key="id" class="flex gap-2">
          <span class="flex-1">★ {{ statText(id) }}</span>
          <button type="button" class="text-red-300" @click="removeJackpot(id)">Remove</button>
        </li>
      </ul>
      <div class="relative">
        <input
          v-model="jackpotQuery"
          class="w-full rounded bg-neutral-800 px-1"
          placeholder="Search mods, e.g. Simulacrum Splinters"
        />
        <ul
          v-if="jackpotResults.length"
          class="absolute z-10 max-h-56 w-full overflow-auto rounded border border-neutral-600 bg-neutral-900"
        >
          <li v-for="r in jackpotResults" :key="r.id">
            <button
              type="button"
              class="w-full px-1 text-left hover:bg-neutral-700"
              @click="addJackpot(r.id)"
            >
              {{ r.text }}
            </button>
          </li>
        </ul>
      </div>
    </section>

    <section class="space-y-2">
      <h2 class="text-lg font-medium">Advanced</h2>
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          :checked="s.devTools"
          @change="settingsStore.update({ devTools: ($event.target as HTMLInputElement).checked })"
        />
        Developer tools (enables the "save last item text" hotkey)
      </label>
      <div class="flex gap-3">
        <button
          type="button"
          class="rounded bg-neutral-700 px-2"
          @click="api.invoke('app:open-logs')"
        >
          Open logs folder
        </button>
        <button
          type="button"
          class="rounded bg-neutral-700 px-2"
          @click="api.invoke('diagnostics:copy')"
        >
          Copy diagnostics
        </button>
      </div>
    </section>

    <AboutPanel />
  </main>
</template>
