<template>
  <BaseModalShell
    scrollable
    title="Request Details"
    :subtitle="request.id ? `ID: ${request.id}` : ''"
    :icon="DocumentMagnifyingGlassIcon"
    max-width-class="max-w-3xl"
    @cancel="handleClose"
  >
    <template #header-actions>
      <button
        type="button"
        @click="handleClose"
        class="p-1 rounded transition-colors shrink-0"
        :class="isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'"
        aria-label="Close"
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </template>

    <!-- Request Details -->
    <div>
            <!-- Method, Status, Match badge, timestamp -->
            <div class="flex flex-wrap items-center gap-3 pb-4 border-b" :class="t.border">
              <span :class="getMethodBgColor(request.request.method)" class="px-3 py-1 rounded text-sm font-bold text-white">
                {{ request.request.method }}
              </span>
              <span v-if="effectiveStatus !== null" :class="getStatusCodeColor(effectiveStatus)" class="px-3 py-1 rounded text-sm font-bold text-white">
                {{ effectiveStatus }}
              </span>
              <span
                v-if="request.wasMatched !== undefined"
                class="px-3 py-1 rounded text-xs font-semibold"
                :class="request.wasMatched
                  ? (isDark ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700' : 'bg-emerald-100 text-emerald-700 border border-emerald-200')
                  : (isDark ? 'bg-amber-900/50 text-amber-300 border border-amber-700' : 'bg-amber-100 text-amber-700 border border-amber-200')"
              >
                {{ request.wasMatched ? 'Matched' : 'Unmatched' }}
              </span>
              <span :class="t.mutedText" class="text-sm">
                {{ fmtDate(request.request.loggedDateString || request.request.loggedDate) }}
              </span>
            </div>

            <!-- Request URL -->
            <div class="py-4 border-b" :class="t.border">
              <p :class="t.mutedText" class="text-xs uppercase tracking-wide font-medium mb-2">
                URL
              </p>
              <p :class="isDark ? 'text-gray-300 bg-gray-800' : 'text-gray-700 bg-gray-100'" class="font-mono text-sm p-3 rounded break-all">
                {{ request.request.absoluteUrl }}
              </p>
              <p v-if="request.request.url && request.request.url !== request.request.absoluteUrl"
                :class="isDark ? 'text-gray-500' : 'text-gray-500'" class="font-mono text-xs mt-2 break-all">
                Path: {{ request.request.url }}
              </p>
            </div>

            <!-- Request Info -->
            <div class="py-4 border-b" :class="t.border">
              <p :class="t.mutedText" class="text-xs uppercase tracking-wide font-medium mb-3">
                Request Info
              </p>
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <p :class="t.subtleText" class="text-xs">Client IP</p>
                  <p :class="t.label" class="font-mono mt-1">{{ request.request.clientIp }}</p>
                </div>
                <div>
                  <p :class="t.subtleText" class="text-xs">Scheme</p>
                  <p :class="t.label" class="font-mono mt-1">{{ request.request.scheme }}</p>
                </div>
                <div>
                  <p :class="t.subtleText" class="text-xs">Host</p>
                  <p :class="t.label" class="font-mono mt-1">{{ request.request.host }}</p>
                </div>
                <div>
                  <p :class="t.subtleText" class="text-xs">Port</p>
                  <p :class="t.label" class="font-mono mt-1">{{ request.request.port }}</p>
                </div>
                <div>
                  <p :class="t.subtleText" class="text-xs">Protocol</p>
                  <p :class="t.label" class="font-mono mt-1">{{ request.request.protocol }}</p>
                </div>
                <div v-if="request.request.browserProxyRequest !== undefined">
                  <p :class="t.subtleText" class="text-xs">Browser Proxy</p>
                  <p :class="t.label" class="font-mono mt-1">{{ request.request.browserProxyRequest ? 'yes' : 'no' }}</p>
                </div>
              </div>
            </div>

            <!-- Query Parameters -->
            <div v-if="hasQueryParams" class="py-4 border-b" :class="t.border">
              <p :class="t.mutedText" class="text-xs uppercase tracking-wide font-medium mb-3">
                Query Parameters
              </p>
              <div :class="isDark ? 'bg-gray-800' : 'bg-gray-100'" class="rounded p-3 space-y-2">
                <div v-for="(param, key) in request.request.queryParams" :key="key" class="text-sm">
                  <p :class="t.mutedText" class="font-medium">{{ key }}</p>
                  <p :class="t.label" class="font-mono text-xs mt-1 break-all">{{ formatQueryValues(param) }}</p>
                </div>
              </div>
            </div>

            <!-- Cookies -->
            <div v-if="hasCookies" class="py-4 border-b" :class="t.border">
              <p :class="t.mutedText" class="text-xs uppercase tracking-wide font-medium mb-3">
                Cookies
              </p>
              <div :class="isDark ? 'bg-gray-800' : 'bg-gray-100'" class="rounded p-3 space-y-2">
                <div v-for="(value, key) in request.request.cookies" :key="key" class="text-sm">
                  <p :class="t.mutedText" class="font-medium">{{ key }}</p>
                  <p :class="t.label" class="font-mono text-xs mt-1 break-all">{{ value }}</p>
                </div>
              </div>
            </div>

            <!-- Form Parameters -->
            <div v-if="hasFormParams" class="py-4 border-b" :class="t.border">
              <p :class="t.mutedText" class="text-xs uppercase tracking-wide font-medium mb-3">
                Form Parameters
              </p>
              <div :class="isDark ? 'bg-gray-800' : 'bg-gray-100'" class="rounded p-3 space-y-2">
                <div v-for="(param, key) in request.request.formParams" :key="key" class="text-sm">
                  <p :class="t.mutedText" class="font-medium">{{ key }}</p>
                  <p :class="t.label" class="font-mono text-xs mt-1 break-all">{{ formatFormValue(param) }}</p>
                </div>
              </div>
            </div>

            <!-- Request Headers -->
            <div class="py-4 border-b" :class="t.border">
              <p :class="t.mutedText" class="text-xs uppercase tracking-wide font-medium mb-3">
                Request Headers
              </p>
              <div v-if="!request.request.headers || Object.keys(request.request.headers).length === 0" :class="t.subtleText" class="text-sm">
                No headers
              </div>
              <div v-else :class="isDark ? 'bg-gray-800' : 'bg-gray-100'" class="rounded p-3 space-y-2">
                <div v-for="(value, key) in request.request.headers" :key="key" class="text-sm">
                  <p :class="t.mutedText" class="font-medium">{{ key }}</p>
                  <p :class="t.label" class="font-mono text-xs mt-1 break-all">{{ value }}</p>
                </div>
              </div>
            </div>

            <!-- Request Body -->
            <div v-if="request.request.body" class="py-4 border-b" :class="t.border">
              <p :class="t.mutedText" class="text-xs uppercase tracking-wide font-medium mb-3">
                Request Body
              </p>
              <BaseCodeBlock :code="formatJson(request.request.body)" size="xs" max-height-class="max-h-64" />
            </div>

            <!-- Actual Response Status & Headers -->
            <div v-if="request.response" class="py-4 border-b" :class="t.border">
              <p :class="t.mutedText" class="text-xs uppercase tracking-wide font-medium mb-3">
                Response ({{ request.response.status }})
              </p>
              <div v-if="request.response.headers && Object.keys(request.response.headers).length > 0" :class="isDark ? 'bg-gray-800' : 'bg-gray-100'" class="rounded p-3 space-y-2 mb-3">
                <div v-for="(value, key) in request.response.headers" :key="key" class="text-sm">
                  <p :class="t.mutedText" class="font-medium">{{ key }}</p>
                  <p :class="t.label" class="font-mono text-xs mt-1 break-all">{{ value }}</p>
                </div>
              </div>
              <BaseCodeBlock v-if="request.response.body" :code="formatJson(request.response.body)" size="xs" max-height-class="max-h-64" />
              <p v-else :class="t.subtleText" class="text-sm italic">Empty response body</p>
            </div>

            <!-- Response Definition (stub-defined) -->
            <div v-if="request.responseDefinition" class="py-4 border-b" :class="t.border">
              <p :class="t.mutedText" class="text-xs uppercase tracking-wide font-medium mb-3">
                Response Definition ({{ request.responseDefinition.status }})
              </p>
              <div v-if="request.responseDefinition.headers && Object.keys(request.responseDefinition.headers).length > 0" :class="isDark ? 'bg-gray-800' : 'bg-gray-100'" class="rounded p-3 space-y-2 mb-3">
                <div v-for="(value, key) in request.responseDefinition.headers" :key="key" class="text-sm">
                  <p :class="t.mutedText" class="font-medium">{{ key }}</p>
                  <p :class="t.label" class="font-mono text-xs mt-1 break-all">{{ value }}</p>
                </div>
              </div>
              <BaseCodeBlock v-if="request.responseDefinition.body" :code="formatJson(request.responseDefinition.body)" size="xs" max-height-class="max-h-64" />
            </div>

            <!-- Matched Stub Mapping -->
            <div v-if="request.stubMapping" class="py-4 border-b" :class="t.border">
              <div class="flex items-center justify-between mb-3">
                <p :class="t.mutedText" class="text-xs uppercase tracking-wide font-medium">
                  Matched Stub
                </p>
                <button
                  v-if="editableMockParams"
                  type="button"
                  @click="goToEditMock"
                  class="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border transition-colors duration-300 ease-in-out cursor-pointer"
                  :class="isDark ? 'text-emerald-300 border-emerald-700 bg-emerald-900/30 hover:bg-emerald-800/50' : 'text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100'"
                  title="Open this mock in the editor"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit Mock
                </button>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mb-3">
                <div v-if="request.stubMapping.id">
                  <p :class="t.subtleText" class="text-xs">Stub ID</p>
                  <p :class="t.label" class="font-mono mt-1 break-all">{{ request.stubMapping.id }}</p>
                </div>
                <div v-if="request.stubMapping.name">
                  <p :class="t.subtleText" class="text-xs">Name</p>
                  <p :class="t.label" class="font-mono mt-1 break-all">{{ request.stubMapping.name }}</p>
                </div>
                <div v-if="request.stubMapping.persistent !== undefined">
                  <p :class="t.subtleText" class="text-xs">Persistent</p>
                  <p :class="t.label" class="font-mono mt-1">{{ request.stubMapping.persistent ? 'yes' : 'no' }}</p>
                </div>
                <div v-if="request.stubMapping.priority !== undefined">
                  <p :class="t.subtleText" class="text-xs">Priority</p>
                  <p :class="t.label" class="font-mono mt-1">{{ request.stubMapping.priority }}</p>
                </div>
              </div>

              <div v-if="stubMetadataEntries.length > 0" class="mb-3">
                <p :class="t.subtleText" class="text-xs mb-2">Metadata</p>
                <div :class="isDark ? 'bg-gray-800' : 'bg-gray-100'" class="rounded p-3 space-y-2">
                  <div v-for="[key, value] in stubMetadataEntries" :key="key" class="text-sm">
                    <p :class="t.mutedText" class="font-medium">{{ key }}</p>
                    <p :class="t.label" class="font-mono text-xs mt-1 break-all">{{ stringifyValue(value) }}</p>
                  </div>
                </div>
              </div>

              <div v-if="request.stubMapping.request">
                <p :class="t.subtleText" class="text-xs mb-2">Request Pattern</p>
                <BaseCodeBlock :code="JSON.stringify(request.stubMapping.request, null, 2)" size="xs" max-height-class="max-h-48" />
              </div>
            </div>

            <!-- Timing -->
            <div v-if="hasTiming" class="py-4">
              <p :class="t.mutedText" class="text-xs uppercase tracking-wide font-medium mb-3">
                Timing (ms)
              </p>
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div v-if="request.timing?.totalTime !== undefined">
                  <p :class="t.subtleText" class="text-xs">Total</p>
                  <p :class="t.label" class="font-mono mt-1">{{ request.timing.totalTime }}</p>
                </div>
                <div v-if="request.timing?.serveTime !== undefined">
                  <p :class="t.subtleText" class="text-xs">Serve</p>
                  <p :class="t.label" class="font-mono mt-1">{{ request.timing.serveTime }}</p>
                </div>
                <div v-if="request.timing?.processTime !== undefined">
                  <p :class="t.subtleText" class="text-xs">Process</p>
                  <p :class="t.label" class="font-mono mt-1">{{ request.timing.processTime }}</p>
                </div>
                <div v-if="request.timing?.responseSendTime !== undefined">
                  <p :class="t.subtleText" class="text-xs">Response Send</p>
                  <p :class="t.label" class="font-mono mt-1">{{ request.timing.responseSendTime }}</p>
                </div>
                <div v-if="request.timing?.addedDelay !== undefined">
                  <p :class="t.subtleText" class="text-xs">Added Delay</p>
                  <p :class="t.label" class="font-mono mt-1">{{ request.timing.addedDelay }}</p>
                </div>
              </div>
            </div>
          </div>

    <template #footer>
      <!--
        Themed Close button via the shared ghostButton role — adapts to
        dark/light without the BaseButton WHITE-stays-white problem.
      -->
      <button
        type="button"
        @click="handleClose"
        class="inline-flex items-center justify-center px-4 py-2 border rounded-md shadow-sm text-sm font-medium transition-colors cursor-pointer"
        :class="t.ghostButton"
      >
        Close
      </button>
    </template>
  </BaseModalShell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { DocumentMagnifyingGlassIcon } from '@heroicons/vue/24/outline'
import { BaseCodeBlock, BaseModalShell, fmtDate, formatJson, methodBadgeSolid, statusBadgeSolid, stringifyValue, useTheme, useThemeClasses } from 'mgv-backoffice'
import type { LoggedRequest, QueryParam } from '../types/requestJournal'

interface Props {
  // The full LoggedRequest is passed in from the parent rather than re-fetched
  // by ID. This keeps the Logs page's traffic isolated to a single endpoint
  // (POST /__admin/requests/find) — any row the user clicks is already in the
  // list returned by that call.
  request: LoggedRequest
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
}>()

const { isDark } = useTheme()
const t = useThemeClasses()
const router = useRouter()

const request = computed(() => props.request)

const getMethodBgColor = methodBadgeSolid
const getStatusCodeColor = statusBadgeSolid

const effectiveStatus = computed<number | null>(() => {
  return (
    request.value.response?.status
    ?? request.value.responseDefinition?.status
    ?? null
  )
})

const hasQueryParams = computed(
  () => !!request.value.request.queryParams && Object.keys(request.value.request.queryParams).length > 0,
)

const hasCookies = computed(
  () => !!request.value.request.cookies && Object.keys(request.value.request.cookies).length > 0,
)

const hasFormParams = computed(
  () => !!request.value.request.formParams && Object.keys(request.value.request.formParams).length > 0,
)

const stubMetadataEntries = computed<[string, unknown][]>(() => {
  const md = request.value.stubMapping?.metadata
  return md ? Object.entries(md) : []
})

// Derive the params needed to route to the mock editor. Only surfaces the
// Edit button when both the stub id and a metadata.projectId are present
// (WireMate-generated stubs tag themselves with projectId in metadata).
const editableMockParams = computed<{ projectId: string; mockId: string } | null>(() => {
  const stub = request.value.stubMapping
  if (!stub?.id) return null
  const projectId = stub.metadata?.projectId
  if (typeof projectId !== 'string' || !projectId) return null
  return { projectId, mockId: stub.id }
})

function goToEditMock() {
  const params = editableMockParams.value
  if (!params) return
  router.push({ name: 'edit-mock', params: { id: params.projectId, mockId: params.mockId } })
  emit('close')
}

const hasTiming = computed(() => {
  const t = request.value.timing
  if (!t) return false
  return (
    t.totalTime !== undefined
    || t.serveTime !== undefined
    || t.processTime !== undefined
    || t.responseSendTime !== undefined
    || t.addedDelay !== undefined
  )
})

// formatJson / stringifyValue migrated to mgv-backoffice (v1.34.0) —
// imported at the top of this file.

function formatQueryValues(param: QueryParam): string {
  if (!param) return ''
  const values = param.values ?? []
  return values.join(', ')
}

function formatFormValue(value: QueryParam | string[] | string): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.join(', ')
  if (value && typeof value === 'object' && Array.isArray(value.values)) {
    return value.values.join(', ')
  }
  return String(value)
}

function handleClose() {
  emit('close')
}
</script>
