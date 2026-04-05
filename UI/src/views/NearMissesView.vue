<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { BaseButton, BaseButtonEnum, BaseCodeBlock, BaseConfirmModal, BasePageHeader, BaseSpinner, BaseToast, BaseToastEnum, BaseToolbarButton, useTheme, useThemeClasses, useToast } from 'mgv-backoffice'
import { ExclamationCircleIcon, ExclamationTriangleIcon, ArrowPathIcon, TrashIcon } from '@heroicons/vue/24/outline'
import { fetchNearMisses } from '../services/settingsService'
import { deleteAllRequests } from '../services/requestJournalService'
import type { NearMissEntry, NearMissesResponse } from '../types/nearMisses'

const { isDark } = useTheme()
const t = useThemeClasses()
const { showToast, toastMessage, toastType, showToastMessage } = useToast()

const nearMisses = ref<NearMissEntry[]>([])
const isLoading = ref(false)
// Separate from `isLoading` so the Clear All button's own spinner doesn't
// get tangled up with the list's loading state — both can be active
// simultaneously (user hits Clear → success path re-triggers loadNearMisses).
const isDeleting = ref(false)
const showClearAllModal = ref(false)
const errorMsg = ref('')
const expandedIndex = ref<number | null>(null)

async function loadNearMisses() {
  isLoading.value = true
  errorMsg.value = ''
  try {
    const res = await fetchNearMisses() as NearMissesResponse
    nearMisses.value = res.nearMisses || []
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Failed to load near misses'
  } finally {
    isLoading.value = false
  }
}

function toggleExpand(index: number) {
  expandedIndex.value = expandedIndex.value === index ? null : index
}

// Stable-ish v-for key — WireMock doesn't give near-miss entries a server-side
// id, so we build a composite from request coordinates + the (optional)
// candidate stub id + distance. Index is appended as a last-resort tiebreaker
// so identical-looking entries still get distinct keys.
function nearMissKey(entry: NearMissEntry, index: number): string {
  const parts = [
    entry.request.method,
    entry.request.absoluteUrl || entry.request.url,
    entry.stubMapping?.id ?? 'no-stub',
    entry.matchResult?.distance ?? 'no-dist',
    index,
  ]
  return parts.join('|')
}

function getStubUrl(entry: NearMissEntry): string {
  if (!entry.stubMapping) return '—'
  const r = entry.stubMapping.request
  return r.url || r.urlPath || r.urlPattern || r.urlPathPattern || '—'
}

function matchScore(entry: NearMissEntry): string {
  if (!entry.matchResult) return '—'
  const pct = Math.max(0, Math.round((1 - entry.matchResult.distance) * 100))
  return `${pct}%`
}

function scoreColor(entry: NearMissEntry): string {
  if (!entry.matchResult) return t.dimText
  const pct = (1 - entry.matchResult.distance) * 100
  if (pct >= 80) return t.emeraldText
  if (pct >= 50) return isDark.value ? 'text-yellow-400' : 'text-yellow-600'
  return isDark.value ? 'text-red-400' : 'text-red-600'
}

// ── Clear All ────────────────────────────────────────────────
// Mirrors the behaviour of the Logs (RequestJournal) view. WireMock
// doesn't store near-misses separately — they're derived on demand from
// the request journal. So "Clear All" here is the same underlying call
// as in Logs (`DELETE /__admin/requests`), which empties the journal
// and consequently the near-miss list. The confirm-modal copy makes
// that side-effect explicit so users aren't surprised that the Logs
// page is also wiped.
function handleClearAll() {
  showClearAllModal.value = true
}

async function confirmClearAll() {
  isDeleting.value = true
  try {
    await deleteAllRequests()
    nearMisses.value = []
    showToastMessage('All near misses cleared', BaseToastEnum.SUCCESS)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to clear near misses'
    showToastMessage(message, BaseToastEnum.ERROR)
  } finally {
    isDeleting.value = false
    showClearAllModal.value = false
  }
}

function cancelClearAll() {
  showClearAllModal.value = false
}

onMounted(() => {
  loadNearMisses()
})
</script>

<template>
  <div class="min-h-screen" :class="t.pageBg">
    <div class="pt-8">
      <!-- Shared page header from mgv-backoffice. Pass the page-specific
           icon through the `icon` slot and the action buttons through
           `actions`. -->
      <BasePageHeader
        title="Near Misses"
        subtitle="Requests that almost matched a stub — diagnose misconfigured matchers"
        icon-color="red"
      >
        <template #icon="{ iconClass }">
          <ExclamationTriangleIcon class="w-5 h-5" :class="iconClass" />
        </template>
        <template #actions>
          <BaseToolbarButton
            label="Refresh"
            :disabled="isLoading"
            title="Refresh"
            @click="loadNearMisses"
          >
            <template #icon="{ iconClass }">
              <ArrowPathIcon :class="[iconClass, isLoading ? 'animate-spin text-emerald-500' : '']" />
            </template>
          </BaseToolbarButton>
          <BaseToolbarButton
            variant="danger"
            :label="isDeleting ? 'Clearing…' : 'Clear All'"
            :disabled="isDeleting"
            title="Clear all near misses"
            @click="handleClearAll"
          >
            <template #icon="{ iconClass }">
              <TrashIcon :class="[iconClass, { 'animate-pulse': isDeleting }]" />
            </template>
          </BaseToolbarButton>
        </template>
      </BasePageHeader>
    </div>

    <!-- Main Content -->
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">

      <!-- Loading -->
      <div v-if="isLoading" class="flex justify-center py-16">
        <BaseSpinner size="lg" color="emerald" />
      </div>

      <!-- Error -->
      <div v-else-if="errorMsg" class="text-center py-16">
        <ExclamationCircleIcon class="w-12 h-12 mx-auto mb-3" :class="t.redText" />
        <p class="text-sm mb-4" :class="isDark ? 'text-red-400' : 'text-red-600'">{{ errorMsg }}</p>
        <BaseButton description="Retry" :color="BaseButtonEnum.GREEN" @click="loadNearMisses" />
      </div>

      <!-- Empty state -->
      <div v-else-if="nearMisses.length === 0" class="text-center py-16">
        <ExclamationCircleIcon class="w-16 h-16 mx-auto mb-4" :class="t.illustration" />
        <h2 class="text-lg font-semibold mb-2" :class="t.bodyText">No near misses</h2>
        <p :class="t.dimTextAlt">
          All incoming requests are matching their stubs, or no unmatched requests have been recorded.
        </p>
      </div>

      <!-- Near misses list -->
      <div v-else class="space-y-3">
        <p class="text-sm mb-4" :class="t.dimTextAlt">
          {{ nearMisses.length }} near miss{{ nearMisses.length !== 1 ? 'es' : '' }} found
        </p>

        <div v-for="(entry, index) in nearMisses" :key="nearMissKey(entry, index)"
          class="rounded-lg border transition-colors duration-300 ease-in-out overflow-hidden"
          :class="isDark ? 'bg-gray-800 border-gray-700 hover:bg-gray-900' : 'bg-white border-gray-200 hover:bg-gray-100'">

          <!-- Header row -->
          <button @click="toggleExpand(index)"
            class="w-full flex items-center gap-4 px-5 py-4 text-left cursor-pointer transition-colors duration-300 ease-in-out"
            :class="isDark ? 'hover:bg-gray-750' : 'hover:bg-gray-50'">
            <!-- Method badge -->
            <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide shrink-0"
              :class="entry.request.method === 'GET' ? (isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-green-100 text-green-700')
                : entry.request.method === 'POST' ? (isDark ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-100 text-blue-700')
                : entry.request.method === 'PUT' ? (isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-yellow-100 text-yellow-700')
                : entry.request.method === 'DELETE' ? (isDark ? 'bg-red-500/15 text-red-400' : 'bg-red-100 text-red-700')
                : (isDark ? 'bg-gray-500/15 text-gray-400' : 'bg-gray-100 text-gray-600')">
              {{ entry.request.method }}
            </span>

            <!-- URL -->
            <span class="flex-1 text-sm font-mono truncate" :class="t.bodyText">
              {{ entry.request.url }}
            </span>

            <!-- Score -->
            <span class="text-sm font-semibold shrink-0" :class="scoreColor(entry)">
              {{ matchScore(entry) }} match
            </span>

            <!-- Expand chevron -->
            <span class="text-xs transition-transform duration-300" :class="[t.dimText, expandedIndex === index ? 'rotate-180' : '']">
              ▾
            </span>
          </button>

          <!-- Expanded details -->
          <div v-if="expandedIndex === index"
            class="border-t px-5 py-4 space-y-4 transition-colors duration-300 ease-in-out"
            :class="isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-100 bg-gray-50'">

            <!-- Closest stub -->
            <div v-if="entry.stubMapping">
              <p class="text-xs font-semibold uppercase tracking-wide mb-2" :class="t.dimText">
                Closest Stub
              </p>
              <div class="rounded-lg border p-3" :class="t.cardAlt">
                <p class="text-sm font-medium" :class="t.bodyText">
                  {{ entry.stubMapping.name || 'Unnamed stub' }}
                </p>
                <p class="text-xs font-mono mt-1" :class="t.dimTextAlt">
                  {{ entry.stubMapping.request.method || 'ANY' }} {{ getStubUrl(entry) }}
                </p>
                <p class="text-xs mt-1" :class="t.dimText">
                  ID: {{ entry.stubMapping.id }}
                </p>
              </div>
            </div>

            <!-- Full request details -->
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide mb-2" :class="t.dimText">
                Request Details
              </p>
              <BaseCodeBlock
                :code="JSON.stringify(entry.request, null, 2)"
                variant="bordered"
                size="xs"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Clear All confirmation modal -->
    <BaseConfirmModal
      v-if="showClearAllModal"
      title="Clear All Near Misses"
      message="Are you sure you want to clear all near misses? Near misses are derived from WireMock's request journal, so this also clears the Logs view. This action cannot be undone."
      confirm-text="Yes, clear all"
      cancel-text="Cancel"
      submitting-text="Clearing..."
      variant="danger"
      :submitting="isDeleting"
      @confirm="confirmClearAll"
      @cancel="cancelClearAll"
    />

    <!-- Toast Notifications -->
    <BaseToast
      v-if="showToast"
      :description="toastMessage"
      :mode="toastType"
    />
  </div>
</template>

