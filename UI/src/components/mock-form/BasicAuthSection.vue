<template>
  <BaseCollapsibleSection
    title="Basic Authentication"
    :collapsed="collapsed"
    :badge="enabled ? 'Active' : null"
    @toggle="emit('toggle')"
  >
    <div class="flex items-center gap-2 mb-4">
      <input
        id="enableBasicAuth"
        v-model="enabledModel"
        type="checkbox"
        class="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
      />
      <label for="enableBasicAuth" class="text-sm" :class="labelClasses">
        Enable Basic Auth matching
      </label>
    </div>

    <div v-if="enabled" class="space-y-4">
      <!--
        Mode selector — segmented control. Same username/password fields
        feed both modes, so flipping the toggle is non-destructive: it
        only changes how the payload is shaped on save.
          - Plain credentials   -> request.basicAuthCredentials = { user, pass }
          - Authorization header -> request.headers.Authorization.equalTo
                                    = 'Basic <b64>'
      -->
      <div>
        <label class="block text-sm font-medium mb-2" :class="labelClasses">
          Match Mode
        </label>
        <div
          class="inline-flex rounded-lg border overflow-hidden"
          :class="isDark ? 'border-gray-600' : 'border-gray-300'"
        >
          <button
            type="button"
            class="px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer"
            :class="modeButtonClasses('plain')"
            @click="modeModel = 'plain'"
          >
            Plain credentials
          </button>
          <button
            type="button"
            class="px-3 py-1.5 text-xs font-medium border-l transition-colors cursor-pointer"
            :class="[
              isDark ? 'border-gray-600' : 'border-gray-300',
              modeButtonClasses('base64'),
            ]"
            @click="modeModel = 'base64'"
          >
            Authorization header (base64)
          </button>
        </div>
        <p class="text-xs mt-1.5" :class="t.dimText">
          <template v-if="mode === 'plain'">
            WireMock decodes the incoming <code>Authorization</code> header and compares against the literal username/password.
          </template>
          <template v-else>
            Stub matches the exact <code>Authorization: Basic &lt;base64&gt;</code> header value verbatim.
          </template>
        </p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label
            class="block text-sm font-medium mb-1"
            :class="[labelClasses, !username.trim() ? t.redText : '']"
          >
            Username *
          </label>
          <input
            v-model="usernameModel"
            type="text"
            placeholder="expected username"
            autocomplete="off"
            spellcheck="false"
            autocorrect="off"
            autocapitalize="off"
            class="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors"
            :class="requiredInputClasses(username.trim())"
          />
        </div>
        <div>
          <label
            class="block text-sm font-medium mb-1"
            :class="[labelClasses, !password.trim() ? t.redText : '']"
          >
            Password *
          </label>
          <!--
            Mock-side basic auth values, not real credentials. The field
            stays as plain text so the user can verify what they're typing
            matches the stub matcher; autocomplete is disabled so password
            managers don't offer to save these as the user's own credentials.
          -->
          <input
            v-model="passwordModel"
            type="text"
            placeholder="expected password"
            autocomplete="off"
            spellcheck="false"
            autocorrect="off"
            autocapitalize="off"
            class="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors"
            :class="requiredInputClasses(password.trim())"
          />
        </div>
      </div>

      <div
        v-if="mode === 'base64' && base64Preview"
        class="rounded-lg border p-3"
        :class="isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-gray-50'"
      >
        <p class="text-xs font-medium mb-1" :class="labelClasses">
          Authorization header preview
        </p>
        <code
          class="text-xs font-mono break-all"
          :class="isDark ? 'text-emerald-300' : 'text-emerald-700'"
        >{{ base64Preview }}</code>
      </div>
    </div>
  </BaseCollapsibleSection>
</template>

<script setup lang="ts">
/**
 * BasicAuthSection — request-side basic-auth matcher.
 *
 * Extracted from CreateMock.vue's monolithic template. State stays in
 * the parent (v-model), helpers (base64 encoding, dark/light class
 * variants, required-field red border) live here so the parent doesn't
 * have to thread style functions through props.
 */
import { computed } from 'vue'
import { BaseCollapsibleSection, useFieldClasses, useTheme, useThemeClasses } from 'mgv-backoffice'

interface Props {
  collapsed: boolean
  enabled: boolean
  username: string
  password: string
  mode: 'plain' | 'base64'
}

const props = defineProps<Props>()

const emit = defineEmits<{
  toggle: []
  'update:enabled': [value: boolean]
  'update:username': [value: string]
  'update:password': [value: string]
  'update:mode': [value: 'plain' | 'base64']
}>()

const enabledModel = computed({
  get: () => props.enabled,
  set: (v) => emit('update:enabled', v),
})
const usernameModel = computed({
  get: () => props.username,
  set: (v) => emit('update:username', v),
})
const passwordModel = computed({
  get: () => props.password,
  set: (v) => emit('update:password', v),
})
const modeModel = computed({
  get: () => props.mode,
  set: (v) => emit('update:mode', v),
})

const { isDark } = useTheme()
const t = useThemeClasses()

// Shared field skin (label / required-red-input) from the lib composable.
const { label: labelClasses, requiredInput: requiredInputClasses } = useFieldClasses()

function modeButtonClasses(target: 'plain' | 'base64'): string {
  if (props.mode === target) {
    return isDark.value ? 'bg-emerald-600 text-white' : 'bg-emerald-500 text-white'
  }
  return isDark.value
    ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
    : 'bg-white text-gray-600 hover:bg-gray-50'
}

// Live base64 of `Basic ${username}:${password}` — encoded with a
// UTF-8-safe path so non-ASCII characters survive. Empty when either
// field is blank to avoid showing "Basic Og==" (the encoding of just `:`).
const base64Preview = computed(() => {
  if (!props.username && !props.password) return ''
  const bytes = new TextEncoder().encode(`${props.username}:${props.password}`)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `Basic ${btoa(binary)}`
})
</script>
