<template>
  <BaseCollapsibleSection
    title="Proxying"
    :collapsed="collapsed"
    :badge="enabled ? 'Active' : null"
    @toggle="emit('toggle')"
  >
    <p class="text-xs mb-4" :class="t.dimText">
      Forward matched requests to a real backend.
    </p>
    <div class="flex items-center gap-2 mb-4">
      <input
        id="enableProxy"
        v-model="enabledModel"
        type="checkbox"
        :disabled="faultEnabled"
        class="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <label
        for="enableProxy"
        class="text-sm"
        :class="[labelClasses, faultEnabled ? 'opacity-50 cursor-not-allowed' : '']"
      >
        Enable proxy forwarding
      </label>
    </div>
    <BaseAlert v-if="faultEnabled" compact :color="AlertEnum.WARNING">
      Proxying is unavailable while Fault Simulation is enabled.
    </BaseAlert>

    <div v-if="enabled" class="space-y-4">
      <div>
        <label
          class="block text-sm font-medium mb-1"
          :class="[labelClasses, (!baseUrl.trim() || urlError) ? t.redText : '']"
        >
          Proxy Base URL *
        </label>
        <input
          v-model="baseUrlModel"
          type="text"
          placeholder="https://api.example.com"
          class="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors"
          :class="urlError
            ? (isDark ? 'bg-gray-800 border-red-500 text-gray-100 focus:ring-red-500 focus:border-red-500 ring-1 ring-red-500/30' : 'bg-white border-red-400 text-gray-800 focus:ring-red-500 focus:border-red-500 ring-1 ring-red-400/30')
            : requiredInputClasses(baseUrl.trim())"
        />
        <p v-if="urlError" class="text-xs text-red-500 mt-1">{{ urlError }}</p>
      </div>

      <!-- Additional proxy headers (key/value rows) -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <label class="block text-sm font-medium" :class="labelClasses">
            Additional Proxy Headers
          </label>
          <BaseChipButton @click="addHeaderRow">+ Add</BaseChipButton>
        </div>
        <div v-for="(header, i) in additionalHeaders" :key="i" class="mb-2">
          <div class="flex gap-2">
            <input
              v-model="header.key"
              placeholder="Header name"
              class="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors"
              :class="isRowKeyMissing(header) ? requiredInputClasses('') : inputClasses"
            />
            <input
              v-model="header.value"
              placeholder="Header value"
              class="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors"
              :class="isRowValueMissing(header) ? requiredInputClasses('') : inputClasses"
            />
            <BaseRemoveButton aria-label="Remove proxy header" @click="removeHeaderRow(i)" />
          </div>
          <p v-if="isRowValueMissing(header)" class="text-xs text-red-500 mt-1">
            Header value is required when a header name is provided.
          </p>
          <p v-if="isRowKeyMissing(header)" class="text-xs text-red-500 mt-1">
            Header name is required when a value is provided.
          </p>
        </div>
      </div>

      <!-- removeHeaders — names to strip from the request before forwarding -->
      <div>
        <div class="flex items-center gap-2 mb-1 flex-wrap">
          <label class="block text-sm font-medium" :class="labelClasses">
            Remove Headers Before Proxying
          </label>
        </div>
        <p class="text-xs mb-2" :class="t.dimText">
          A list of header names to remove from the request before forwarding.
        </p>
        <div class="flex gap-2 mb-2">
          <input
            v-model="removeInputModel"
            type="text"
            placeholder="Header name to remove"
            class="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors"
            :class="inputClasses"
            @keyup.enter="addRemove"
          />
          <button
            type="button"
            class="px-3 py-2 text-xs font-medium rounded-lg"
            :class="isDark ? 'text-emerald-400 hover:text-emerald-300 bg-gray-800' : 'text-emerald-600 hover:text-emerald-800 bg-gray-100'"
            @click="addRemove"
          >Add</button>
        </div>
        <div v-if="removeHeaders.length > 0" class="flex flex-wrap gap-2 mb-2">
          <span
            v-for="(h, i) in removeHeaders"
            :key="i"
            class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded font-mono"
            :class="isDark ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-600'"
          >
            {{ h }}
            <BaseRemoveButton aria-label="Remove entry" @click="removeRemoveAt(i)" />
          </span>
        </div>
      </div>
    </div>
  </BaseCollapsibleSection>
</template>

<script setup lang="ts">
/**
 * ProxyingSection — forwards matched requests to a real backend instead
 * of replaying a canned response. Mutually exclusive with Fault
 * Simulation (the parent disables proxy when fault is on, and vice versa).
 *
 * Three concepts:
 *   • baseUrl              — required absolute URL of the forwarded host.
 *   • additionalHeaders    — request-side headers injected before forwarding.
 *   • removeHeaders        — request-side headers stripped before forwarding.
 *                            Stored as a name-only string[] (case-insensitive,
 *                            dedup'd at add time).
 */
import { computed } from 'vue'
import { AlertEnum, BaseAlert, BaseChipButton, BaseCollapsibleSection, BaseRemoveButton, rowKeyMissing, rowValueMissing, useFieldClasses, useTheme, useThemeClasses } from 'mgv-backoffice'
import { isValidAbsoluteUrl } from 'mgv-backoffice'

interface ProxyHeaderRow {
  key: string
  value: string
}

interface Props {
  collapsed: boolean
  enabled: boolean
  baseUrl: string
  additionalHeaders: ProxyHeaderRow[]
  removeHeaders: string[]
  removeInput: string
  /** When true, fault sim is active and proxy is disabled. */
  faultEnabled: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  toggle: []
  'update:enabled': [value: boolean]
  'update:baseUrl': [value: string]
  'update:removeHeaders': [value: string[]]
  'update:removeInput': [value: string]
}>()

const enabledModel = computed({
  get: () => props.enabled,
  set: (v) => emit('update:enabled', v),
})
const baseUrlModel = computed({
  get: () => props.baseUrl,
  set: (v) => emit('update:baseUrl', v),
})
const removeInputModel = computed({
  get: () => props.removeInput,
  set: (v) => emit('update:removeInput', v),
})

function addHeaderRow() {
  props.additionalHeaders.push({ key: '', value: '' })
}
function removeHeaderRow(i: number) {
  props.additionalHeaders.splice(i, 1)
}

// Add a removeHeader name. Dedup case-insensitively — HTTP header names
// are case-insensitive, so "Cookie" and "cookie" would be redundant.
function addRemove() {
  const trimmed = props.removeInput.trim()
  if (!trimmed) return
  const exists = props.removeHeaders.some(
    (h) => h.toLowerCase() === trimmed.toLowerCase(),
  )
  if (!exists) {
    emit('update:removeHeaders', [...props.removeHeaders, trimmed])
  }
  emit('update:removeInput', '')
}
function removeRemoveAt(i: number) {
  const next = props.removeHeaders.slice()
  next.splice(i, 1)
  emit('update:removeHeaders', next)
}

// Shared lib validators for the key/value header rows.
const isRowKeyMissing = rowKeyMissing
const isRowValueMissing = rowValueMissing

// Live URL feedback — empty is flagged by the form-level required-field
// validation; this only complains about typed-but-malformed URLs.
const urlError = computed<string>(() => {
  if (!props.enabled) return ''
  const trimmed = props.baseUrl.trim()
  if (!trimmed) return ''
  return isValidAbsoluteUrl(trimmed)
    ? ''
    : 'Invalid URL. Must be an absolute http:// or https:// address (e.g. https://api.example.com).'
})

const { isDark } = useTheme()
const t = useThemeClasses()

// Shared field skin (label / input / required-red-input) from the lib composable.
const { label: labelClasses, input: inputClasses, requiredInput: requiredInputClasses } = useFieldClasses()
</script>
