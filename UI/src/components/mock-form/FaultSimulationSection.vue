<template>
  <BaseCollapsibleSection
    title="Fault Simulation"
    :collapsed="collapsed"
    :badge="enabled ? 'Active' : null"
    @toggle="emit('toggle')"
  >
    <p class="text-xs mb-4" :class="t.dimText">Simulate network-level failures.</p>
    <div class="flex items-center gap-2 mb-4">
      <input
        id="enableFault"
        v-model="enabledModel"
        type="checkbox"
        :disabled="proxyEnabled"
        class="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <label
        for="enableFault"
        class="text-sm"
        :class="[labelClasses, proxyEnabled ? 'opacity-50 cursor-not-allowed' : '']"
      >
        Enable fault simulation
      </label>
    </div>
    <p v-if="proxyEnabled" class="text-xs mb-3" :class="t.amberText">
      Fault simulation is unavailable while Proxying is enabled.
    </p>
    <div v-if="enabled">
      <label class="block text-sm font-medium mb-1" :class="labelClasses">
        Fault Type
      </label>
      <div class="w-full md:w-80">
        <BaseDropdown
          v-model="faultTypeModel"
          :options="FAULT_TYPE_OPTIONS"
          size="sm"
          aria-label="Fault Type"
        />
      </div>
      <p class="text-xs mt-2" :class="t.dimTextAlt">
        {{ selectedDescription }}
      </p>
    </div>
  </BaseCollapsibleSection>
</template>

<script setup lang="ts">
/**
 * FaultSimulationSection — picks one of WireMock's connection-level
 * fault types. Mutually exclusive with Proxying (the parent disables
 * fault simulation when proxying is on, and vice versa).
 *
 * State stays in the parent via v-model; the FAULT_TYPES table lives
 * here because nothing else in the codebase needs it.
 */
import { computed } from 'vue'
import { BaseCollapsibleSection, BaseDropdown, useFieldClasses, useThemeClasses, type DropdownOption } from 'mgv-backoffice'

export type FaultType =
  | 'EMPTY_RESPONSE'
  | 'MALFORMED_RESPONSE_CHUNK'
  | 'RANDOM_DATA_THEN_CLOSE'
  | 'CONNECTION_RESET_BY_PEER'

interface Props {
  collapsed: boolean
  enabled: boolean
  faultType: FaultType
  /** When true, the parent's Proxying section is active — fault sim is disabled. */
  proxyEnabled: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  toggle: []
  'update:enabled': [value: boolean]
  'update:faultType': [value: FaultType]
}>()

const enabledModel = computed({
  get: () => props.enabled,
  set: (v) => emit('update:enabled', v),
})
const faultTypeModel = computed({
  get: () => props.faultType,
  set: (v) => emit('update:faultType', v),
})

const t = useThemeClasses()

// Shared field label skin from the lib composable.
const { label: labelClasses } = useFieldClasses()

const FAULT_TYPES: ReadonlyArray<{ value: FaultType; label: string; description: string }> = [
  {
    value: 'EMPTY_RESPONSE',
    label: 'Empty Response',
    description:
      'Accept the request but return an empty response (0 bytes) and close the connection. Simulates a server that accepts then drops.',
  },
  {
    value: 'MALFORMED_RESPONSE_CHUNK',
    label: 'Malformed Response Chunk',
    description:
      'Send an HTTP status line, then garbled binary data, then close the connection. Simulates a server returning corrupted data.',
  },
  {
    value: 'RANDOM_DATA_THEN_CLOSE',
    label: 'Random Data Then Close',
    description:
      'Send random garbage bytes instead of a valid HTTP response, then close the connection. Simulates a non-HTTP server on the port.',
  },
  {
    value: 'CONNECTION_RESET_BY_PEER',
    label: 'Connection Reset by Peer',
    description:
      'Immediately reset the TCP connection (RST). Simulates a server that abruptly drops before sending any response.',
  },
]

// Shaped for BaseDropdown; the description doubles as the per-row tooltip.
const FAULT_TYPE_OPTIONS: DropdownOption[] = FAULT_TYPES.map((ft) => ({
  value: ft.value,
  label: ft.label,
  title: ft.description,
}))

const selectedDescription = computed(() => {
  const match = FAULT_TYPES.find((f) => f.value === props.faultType)
  return match?.description ?? ''
})
</script>
