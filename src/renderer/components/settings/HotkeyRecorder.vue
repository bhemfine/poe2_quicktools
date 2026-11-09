<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import {
  HOTKEY_LABELS,
  type HotkeyAction,
  type HotkeyBindings,
} from '../../../shared/hotkeys/actions'
import {
  hasBlockingIssue,
  validateHotkey,
  type GameBind,
  type HotkeyIssue,
} from '../../../shared/hotkeys/conflicts'
import { comboFromKeyboardEvent, displayCombo } from '../../../shared/hotkeys/keys'
import { api } from '../../bridge'

const props = defineProps<{
  action: HotkeyAction
  bindings: HotkeyBindings
  defaultCombo: string
  gameBinds: readonly GameBind[]
  wasdMode: boolean
  /** Registration error reported by main for the saved combo. */
  registerError?: string
}>()
const emit = defineEmits<{ save: [combo: string] }>()

const recording = ref(false)
const candidate = ref<string | null>(null)
const candidateIssues = ref<HotkeyIssue[]>([])

const current = computed(() => props.bindings[props.action])
const currentIssues = computed(() =>
  validateHotkey(props.action, current.value, props.bindings, {
    gameBinds: props.gameBinds,
    wasdMode: props.wasdMode,
  }),
)

function start(): void {
  recording.value = true
  candidate.value = null
  candidateIssues.value = []
  window.addEventListener('keydown', onKey, true)
}

function stop(): void {
  recording.value = false
  window.removeEventListener('keydown', onKey, true)
}

async function onKey(e: KeyboardEvent): Promise<void> {
  e.preventDefault()
  e.stopPropagation()
  if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
    // Esc cancels; Escape is still bindable to Dismiss via Reset.
    stop()
    candidate.value = null
    return
  }
  if (e.key === 'Backspace' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
    stop()
    emit('save', '')
    return
  }
  const combo = comboFromKeyboardEvent(e)
  if (!combo) return // only modifiers so far
  stop()
  const issues = validateHotkey(props.action, combo, props.bindings, {
    gameBinds: props.gameBinds,
    wasdMode: props.wasdMode,
  })
  if (!hasBlockingIssue(issues) && combo !== current.value) {
    const free = await api.invoke('hotkeys:is-available', combo)
    if (!free) {
      issues.push({
        level: 'error',
        code: 'register-failed',
        message: 'In use by another program.',
      })
    }
  }
  candidate.value = combo
  candidateIssues.value = issues
  // No problems at all: apply right away.
  if (!issues.length) accept()
}

function accept(): void {
  if (candidate.value === null || hasBlockingIssue(candidateIssues.value)) return
  emit('save', candidate.value)
  candidate.value = null
  candidateIssues.value = []
}

onBeforeUnmount(stop)
</script>

<template>
  <div class="border-b border-neutral-800 py-2">
    <div class="flex items-center gap-2">
      <span class="flex-1 text-sm">{{ HOTKEY_LABELS[action] }}</span>
      <button
        type="button"
        class="w-44 rounded border px-2 py-0.5 text-left font-mono text-sm"
        :class="recording ? 'border-sky-400 bg-sky-950' : 'border-neutral-600 bg-neutral-800'"
        @click="recording ? stop() : start()"
      >
        <template v-if="recording">Press keys…</template>
        <template v-else>{{ displayCombo(current) || 'Not set' }}</template>
      </button>
      <button
        type="button"
        class="text-xs text-sky-400 underline disabled:text-neutral-600 disabled:no-underline"
        :disabled="current === defaultCombo"
        @click="emit('save', defaultCombo)"
      >
        Reset
      </button>
    </div>
    <p v-if="recording" class="mt-1 text-xs text-neutral-400">Backspace clears · Esc cancels</p>

    <div v-if="candidate !== null" class="mt-1 space-y-0.5 text-xs">
      <div>
        New: <b class="font-mono">{{ displayCombo(candidate) }}</b>
      </div>
      <p
        v-for="i in candidateIssues"
        :key="i.code + i.message"
        :class="i.level === 'error' ? 'text-red-300' : 'text-amber-300'"
      >
        {{ i.level === 'error' ? '✕' : '⚠' }} {{ i.message }}
      </p>
      <div class="flex gap-2">
        <button
          v-if="!hasBlockingIssue(candidateIssues)"
          type="button"
          class="rounded bg-amber-700 px-2 text-white"
          @click="accept"
        >
          Use anyway
        </button>
        <button type="button" class="rounded bg-neutral-700 px-2" @click="candidate = null">
          Cancel
        </button>
      </div>
    </div>
    <template v-else>
      <p
        v-for="i in currentIssues"
        :key="i.code + i.message"
        class="mt-1 text-xs"
        :class="i.level === 'error' ? 'text-red-300' : 'text-amber-300/80'"
      >
        {{ i.level === 'error' ? '✕' : '⚠' }} {{ i.message }}
      </p>
      <p v-if="registerError" class="mt-1 text-xs text-red-300">✕ {{ registerError }}</p>
    </template>
  </div>
</template>
