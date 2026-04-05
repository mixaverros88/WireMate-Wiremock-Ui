<template>
  <BaseModalShell
    scrollable
    title="Import from Postman"
    subtitle="Upload a Postman collection (v2.x). Each request is imported as a mock in this project."
    :icon="ArrowUpTrayIcon"
    max-width-class="max-w-2xl"
    :manual-close="isImporting"
    @cancel="handleCancel"
  >
    <!-- Step 1: file picker (before parsing) -->
          <BaseFileDropzone
            v-if="!parseResult && !parseError"
            accept="application/json,.json"
            label="Click to select a Postman collection (.json)"
            hint="Exported from Postman → Export → Collection v2.1"
            @files="onFilesSelected"
          />

          <!-- Step 2: parsing error -->
          <BaseAlert v-else-if="parseError" :color="AlertEnum.ERROR" title="Could not parse collection">
            <p class="mt-1">{{ parseError }}</p>
            <button
              class="mt-3 font-medium underline cursor-pointer"
              :class="isDark ? 'text-red-400 hover:text-red-300' : 'text-red-700 hover:text-red-800'"
              @click="reset"
            >
              Choose a different file
            </button>
          </BaseAlert>

          <!-- Step 3: review parsed requests -->
          <div v-else-if="parseResult">
            <!-- Collection summary -->
            <div class="mb-4 flex items-center justify-between">
              <div>
                <p class="text-sm font-semibold" :class="t.primaryTextSoft">
                  {{ parseResult.collectionName }}
                </p>
                <p class="text-xs mt-0.5" :class="t.dimText">
                  {{ parseResult.requests.length }} request{{ parseResult.requests.length === 1 ? '' : 's' }} found
                </p>
              </div>
              <button
                v-if="!isImporting && !importComplete"
                class="text-xs font-medium cursor-pointer"
                :class="isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'"
                @click="reset"
              >
                Change file
              </button>
            </div>

            <!-- Preview list -->
            <div class="rounded-lg border overflow-hidden"
              :class="t.border">
              <div class="max-h-72 overflow-y-auto divide-y"
                :class="isDark ? 'divide-gray-800' : 'divide-gray-100'">
                <div
                  v-for="(item, idx) in itemsWithStatus"
                  :key="idx"
                  :class="isDark ? 'bg-gray-900' : 'bg-white'"
                >
                  <div class="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span
                      class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide min-w-[3.5rem] justify-center"
                      :class="methodColor(item.request.method)"
                    >
                      {{ item.request.method }}
                    </span>
                    <div class="flex-1 min-w-0">
                      <p class="truncate font-medium" :class="isDark ? 'text-gray-200' : 'text-gray-800'">
                        {{ item.request.name }}
                      </p>
                      <p class="truncate text-xs" :class="t.dimText">
                        {{ item.request.path }}
                      </p>
                    </div>
                    <span v-if="item.status === 'pending'" class="text-xs"
                      :class="isDark ? 'text-gray-600' : 'text-gray-400'">
                      Pending
                    </span>
                    <span v-else-if="item.status === 'in-progress'" class="text-xs"
                      :class="t.emeraldText">
                      Importing…
                    </span>
                    <span v-else-if="item.status === 'success'" class="text-xs flex items-center gap-1"
                      :class="t.emeraldText">
                      <CheckCircleIcon class="w-4 h-4" /> Created
                    </span>
                    <span v-else-if="item.status === 'error'" class="text-xs flex items-center gap-1"
                      :class="isDark ? 'text-red-400' : 'text-red-600'">
                      <XCircleIcon class="w-4 h-4" /> Failed
                    </span>
                  </div>
                  <!--
                    Per-request error callout. `item.error` carries the
                    backend's ProblemDetail `detail` text (extracted by
                    services/errors.ts), so a duplicate-name 400 reads
                    "Mock with name X already exists" instead of the
                    earlier "Failed" tooltip the user had to hover to see.
                    Rendered inline under the row so all failures are
                    scannable at a glance, and `whitespace-pre-wrap +
                    break-words` keeps long messages from blowing out the
                    modal width.
                  -->
                  <div
                    v-if="item.status === 'error' && item.error"
                    class="px-4 pb-3"
                  >
                    <div
                      class="rounded-md text-xs px-3 py-2 whitespace-pre-wrap break-words"
                      :class="isDark
                        ? 'bg-red-500/10 border border-red-500/30 text-red-300'
                        : 'bg-red-50 border border-red-200 text-red-700'"
                    >
                      <span class="font-semibold mr-1">Error:</span>{{ item.error }}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Post-import summary -->
            <div v-if="importComplete" class="mt-4 rounded-lg p-3 text-sm"
              :class="importErrorCount > 0
                ? (isDark ? 'bg-amber-500/10 border border-amber-500/30 text-amber-300' : 'bg-amber-50 border border-amber-200 text-amber-700')
                : (isDark ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300' : 'bg-emerald-50 border border-emerald-200 text-emerald-700')">
              Imported {{ importSuccessCount }} of {{ parseResult.requests.length }} mocks.
              <span v-if="importErrorCount > 0"> {{ importErrorCount }} failed.</span>
            </div>
          </div>

    <template #footer>
      <button
        type="button"
        :disabled="isImporting"
        class="inline-flex items-center justify-center px-4 py-2 border rounded-md shadow-sm text-sm font-medium transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        :class="t.ghostButton"
        @click="handleCancel"
      >
        {{ importComplete ? 'Close' : 'Cancel' }}
      </button>
      <button
        v-if="parseResult && !importComplete"
        type="button"
        :disabled="isImporting"
        class="inline-flex items-center justify-center px-4 py-2 rounded-md shadow-sm text-sm font-medium text-white transition-colors duration-150 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        :class="isDark ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-emerald-600 hover:bg-emerald-700'"
        @click="runImport"
      >
        {{ isImporting ? 'Importing…' : `Import ${parseResult.requests.length} mock${parseResult.requests.length === 1 ? '' : 's'}` }}
      </button>
    </template>
  </BaseModalShell>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  ArrowUpTrayIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/vue/24/outline'
import { AlertEnum, BaseAlert, BaseFileDropzone, BaseModalShell, useTheme, useThemeClasses } from 'mgv-backoffice'
import { mockApi } from '../services/api'
import {
  parsePostmanCollection,
  PostmanParseError,
  type ParseResult,
  type ParsedRequest,
} from '../utils/postmanImport'

interface Props {
  projectId: string
}
const props = defineProps<Props>()

const emit = defineEmits<{
  imported: [count: number]
  cancel: []
}>()

const { isDark } = useTheme()

const t = useThemeClasses()
type ItemStatus = 'pending' | 'in-progress' | 'success' | 'error'

interface ItemWithStatus {
  request: ParsedRequest
  status: ItemStatus
  error?: string
}

const parseResult = ref<ParseResult | null>(null)
const parseError = ref<string>('')
const items = ref<ItemWithStatus[]>([])
const isImporting = ref(false)
const importComplete = ref(false)

const itemsWithStatus = computed(() => items.value)

const importSuccessCount = computed(
  () => items.value.filter(i => i.status === 'success').length,
)
const importErrorCount = computed(
  () => items.value.filter(i => i.status === 'error').length,
)

function methodColor(method: string): string {
  const m = method.toUpperCase()
  if (m === 'GET') return isDark.value ? 'bg-emerald-500/15 text-emerald-400' : 'bg-green-100 text-green-700'
  if (m === 'POST') return isDark.value ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-700'
  if (m === 'PUT') return isDark.value ? 'bg-amber-500/15 text-amber-400' : 'bg-yellow-100 text-yellow-700'
  if (m === 'DELETE') return isDark.value ? 'bg-red-500/15 text-red-400' : 'bg-red-100 text-red-700'
  if (m === 'PATCH') return isDark.value ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-700'
  return isDark.value ? 'bg-gray-500/15 text-gray-400' : 'bg-gray-100 text-gray-600'
}

async function onFilesSelected(files: File[]) {
  const file = files[0]
  if (!file) return
  try {
    const text = await file.text()
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      throw new PostmanParseError('File is not valid JSON')
    }
    const result = parsePostmanCollection(json, props.projectId)
    parseResult.value = result
    items.value = result.requests.map(r => ({ request: r, status: 'pending' as ItemStatus }))
    parseError.value = ''
  } catch (err) {
    parseError.value = err instanceof Error ? err.message : 'Failed to parse collection'
    parseResult.value = null
    items.value = []
  }
}

async function runImport() {
  if (!parseResult.value || isImporting.value) return
  isImporting.value = true
  try {
    for (const item of items.value) {
      item.status = 'in-progress'
      try {
        await mockApi.create(item.request.payload)
        item.status = 'success'
      } catch (err) {
        item.status = 'error'
        item.error = err instanceof Error ? err.message : 'Unknown error'
      }
    }
    importComplete.value = true
    if (importSuccessCount.value > 0) {
      emit('imported', importSuccessCount.value)
    }
  } finally {
    isImporting.value = false
  }
}

function reset() {
  if (isImporting.value) return
  parseResult.value = null
  parseError.value = ''
  items.value = []
  importComplete.value = false
}

function handleCancel() {
  if (isImporting.value) return
  emit('cancel')
}
</script>
