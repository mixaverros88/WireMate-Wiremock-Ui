<script setup lang="ts">
import { ref, onMounted, computed, useTemplateRef } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { BaseButton, BaseButtonEnum, BaseButtonSizeEnum, BaseCodeBlock, BaseConfirmModal, BaseCopyButton, BaseSpinner, BaseToast, BaseToastEnum, fmtDate, methodBadgeBright, statusBadgeTinted, useTheme, useThemeClasses, useToast } from 'mgv-backoffice'
import { ArrowLeftIcon, FolderIcon, ClipboardDocumentListIcon } from '@heroicons/vue/24/outline'
import { getStub, deleteStub } from '../services/stubService'
import { logsLinkRouteQuery } from '../utils/logsLink'
import type { StubMapping } from '../services/stubService'
import { mockApi } from '../services/api'
import type {
  CreateMockPayload,
  MockResponse,
  RequestDefinition,
  ResponseDefinition,
} from '../types/mock'
import SelectProjectModal from '../components/SelectProjectModal.vue'
import WireMateLogo from '../components/WireMateLogo.vue'

const route = useRoute()
const router = useRouter()
const { isDark } = useTheme()

const t = useThemeClasses()
const stub = ref<StubMapping | null>(null)
const loading = ref(true)
const error = ref('')
const showDeleteModal = ref(false)
const isDeleting = ref(false)
// When the stub being deleted is also a WireMate-managed mock, deleting
// only the stub leaves the mock orphaned in the WireMate DB. This opt-in
// flag (surfaced as a checkbox in the delete modal) routes the delete
// through the mock API instead, which removes both sides.
const deleteAlsoMock = ref(false)

const stubId = route.params.id as string

// Toast — timer cleanup handled inside the composable.
const { showToast, toastMessage, toastType, showToastMessage } = useToast(2500)

// ── WireMate mock adoption ─────────────────────────────────────
// A stub on the admin port *might* already be a WireMate-managed mock
// (same UUID on both sides of the sync). We probe GET /api/mocks/{id} on
// mount — if it resolves, the stub is a known mock and we route straight
// to its editor; if it 404s, we surface a "create WireMate Stub" action
// that lets the user adopt the raw stub into a WireMate project.
//   'idle'     — not yet probed
//   'loading'  — probe in flight
//   'exists'   — mock with this id is present in the WireMate backend
//   'missing'  — 404 from /api/mocks/{id} (stub is not a WireMate mock yet)
//   'creating' — adoption POST in flight
//   'error'    — probe failed for a non-404 reason (e.g. backend down);
//                treated as neutral so we don't mislabel a down backend
//                as 'missing' and let the user create a duplicate
type MockStatus = 'idle' | 'loading' | 'exists' | 'missing' | 'creating' | 'error'
const mockStatus = ref<MockStatus>('idle')
const existingMock = ref<MockResponse | null>(null)
const mockStatusError = ref('')

// Controls the project-picker modal that drives the adoption flow.
// `submitting` tracks the POST /api/mocks round-trip so the modal's
// action button can show a loading state; the ref is exposed by the
// child via defineExpose.
const showSelectProjectModal = ref(false)
const selectProjectModalRef = useTemplateRef<{ submitting: boolean }>('selectProjectModalRef')

async function checkMockExistence() {
  mockStatus.value = 'loading'
  mockStatusError.value = ''
  existingMock.value = null
  try {
    existingMock.value = await mockApi.fetchById(stubId)
    mockStatus.value = 'exists'
  } catch (e) {
    const message = e instanceof Error ? e.message : ''
    // The generic API helper surfaces the server body in the thrown
    // message — probe for a 404 shape so we can differentiate
    // "definitely missing" from "couldn't tell". Anything non-404 stays
    // 'error' so a down backend doesn't look like a missing mock.
    if (/404|not found/i.test(message)) {
      mockStatus.value = 'missing'
    } else {
      mockStatus.value = 'error'
      mockStatusError.value = message || 'Failed to check mock status'
    }
  }
}

function goToMockEditor() {
  if (!existingMock.value) return
  router.push({
    name: 'edit-mock',
    params: {
      id: existingMock.value.projectId,
      mockId: existingMock.value.id,
    },
  })
}

// Adopt the raw stub into a WireMate project. Stubs created by WireMate
// carry the originating project on `metadata.projectId`; when that tag
// is present we skip the picker and re-create the mock under that same
// project (this is the "re-publish a stub WireMock still knows about
// but WireMate's DB no longer has" case the cross-check task surfaces).
// Only when the tag is absent — a stub authored directly against the
// WireMock admin API with no WireMate metadata — do we fall back to
// asking the user which project to adopt it into.
function openCreateMockModal() {
  const taggedProjectId = stub.value?.metadata?.projectId
  if (typeof taggedProjectId === 'string' && taggedProjectId) {
    void handleCreateMock(taggedProjectId)
    return
  }
  showSelectProjectModal.value = true
}

function closeCreateMockModal() {
  // Guard against closing mid-POST; the modal also blocks its own Cancel
  // button while `submitting` is true but the backdrop click reaches here.
  if (selectProjectModalRef.value?.submitting) return
  showSelectProjectModal.value = false
}

// Build a CreateMockPayload from the raw stub. The stubService's
// `RequestConfig` / `ResponseConfig` types are loosely-typed siblings of
// WireMock's stub JSON — on the wire they match the WireMate
// `RequestDefinition` / `ResponseDefinition` shape (headers use StringMatcher
// etc.), so we cast through here rather than re-typing every nested field.
function buildCreatePayload(s: StubMapping, projectId: string): CreateMockPayload {
  const payload: CreateMockPayload = {
    name: s.name || `Adopted stub ${s.id.substring(0, 8)}`,
    projectId,
    request: s.request as unknown as RequestDefinition,
    response: s.response as unknown as ResponseDefinition,
    // WireMate mocks default to persistent; the stub's own flag may be
    // `undefined` when it was added directly via the WireMock admin API.
    persistent: s.persistent ?? true,
  }
  if (typeof s.priority === 'number') payload.priority = s.priority

  // Carry over any existing metadata so nothing the user may have
  // stored on the raw stub is silently dropped — but stamp the
  // WireMate `projectId` tag regardless. That tag is what
  // StubsView's "WireMate Stub" button keys off to round-trip back
  // to the editor, so every mock WireMate creates must carry it.
  payload.metadata = {
    ...(s.metadata ?? {}),
    projectId,
  }

  return payload
}

async function handleCreateMock(projectId: string) {
  if (!stub.value) return
  const modal = selectProjectModalRef.value
  if (modal) modal.submitting = true
  mockStatus.value = 'creating'
  try {
    const payload = buildCreatePayload(stub.value, projectId)
    const created = await mockApi.create(payload)
    existingMock.value = created
    mockStatus.value = 'exists'
    showSelectProjectModal.value = false
    showToastMessage(`Stub adopted into WireMate as '${created.name}'`, BaseToastEnum.SUCCESS)
  } catch (e) {
    // Flip back to 'missing' so the button reverts to "create" and the
    // user can pick a different project or retry.
    mockStatus.value = 'missing'
    const message = e instanceof Error ? e.message : 'Failed to create mock'
    showToastMessage(`Failed to create mock: ${message}`, BaseToastEnum.ERROR)
  } finally {
    if (modal) modal.submitting = false
  }
}

onMounted(async () => {
  loading.value = true
  try {
    stub.value = await getStub(stubId)
    // Only probe the backend once the raw stub loaded — no point asking
    // "is this a mock?" if we don't even have a valid stub.
    checkMockExistence()
  } catch (_e) {
    error.value = 'Failed to load stub details'
  } finally {
    loading.value = false
  }
})

function goBack() {
  router.push({ name: 'stubs' })
}

function handleDelete() {
  // Reset the opt-in each time so a previous toggle doesn't silently
  // carry over into the next delete.
  deleteAlsoMock.value = false
  showDeleteModal.value = true
}

async function confirmDelete() {
  if (!stub.value || isDeleting.value) return
  isDeleting.value = true
  try {
    if (deleteAlsoMock.value && existingMock.value) {
      // The backend's mock-delete also unpublishes the WireMock stub
      // (MockService.delete → wireMockService.deleteStub + DB delete), so
      // this single call removes both sides — no orphaned WireMate mock.
      // The stub and mock share the same UUID, so stub.id === mock id.
      await mockApi.delete(stub.value.id)
    } else {
      await deleteStub(stub.value.id)
    }
    router.push({ name: 'stubs' })
  } catch (_e) {
    error.value = 'Failed to delete stub'
  } finally {
    isDeleting.value = false
    showDeleteModal.value = false
  }
}

function cancelDelete() {
  if (isDeleting.value) return
  showDeleteModal.value = false
}

const displayUrl = computed(() => {
  if (!stub.value) return '/'
  return stub.value.request.url || stub.value.request.urlPath || stub.value.request.urlPattern || stub.value.request.urlPathPattern || '/'
})

const requestJson = computed(() => {
  if (!stub.value) return ''
  return JSON.stringify(stub.value.request, null, 2)
})

const responseJson = computed(() => {
  if (!stub.value) return ''
  return JSON.stringify(stub.value.response, null, 2)
})

const fullJson = computed(() => {
  if (!stub.value) return ''
  return JSON.stringify(stub.value, null, 2)
})

const methodColor = methodBadgeBright
const statusColor = (status?: number) => statusBadgeTinted(status, isDark.value)

async function copyToClipboard(text: string, label = 'Text') {
  try {
    await navigator.clipboard.writeText(text)
    showToastMessage(`${label} copied to clipboard`, BaseToastEnum.SUCCESS)
  } catch (_e) {
    showToastMessage('Failed to copy to clipboard', BaseToastEnum.ERROR)
  }
}

// Open the WireMock request journal pre-filtered on this stub's URL.
// Falls back to the stub's name when the matcher is pattern-based and
// `displayUrl` has nothing concrete to filter on — same fallback chain
// ProjectDetailView's per-mock "Logs" button uses, so the two entry
// points behave consistently.
function viewStubLogs() {
  if (!stub.value) return
  // Carry the stub's url matcher type through as `urlMatch` so the Logs
  // page filters with the same matcher (see logsLinkRouteQuery).
  router.push({
    name: 'logs',
    query: logsLinkRouteQuery(stub.value.request, stub.value.name || stub.value.id),
  })
}

</script>

<template>
  <div>
    <div class="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <!-- Back button -->
      <BaseButton
        :color="BaseButtonEnum.GRAY"
        :size="BaseButtonSizeEnum.SMALL"
        ghost
        iconLeft
        description="Back to Stubs"
        class="mb-6"
        @click="goBack"
      >
        <ArrowLeftIcon class="w-4 h-4 mr-1.5" />
      </BaseButton>

      <!-- Loading -->
      <div v-if="loading" class="flex justify-center py-20">
        <BaseSpinner size="lg" color="emerald" />
      </div>

      <!-- Error -->
      <div v-else-if="error && !stub" class="text-center py-20">
        <p class="text-red-500 mb-4">{{ error }}</p>
        <BaseButton
          description="Back to Stubs"
          :color="BaseButtonEnum.GREEN"
          @click="goBack"
        />
      </div>

      <!-- Stub details -->
      <div v-else-if="stub">
        <!-- Header card -->
        <div class="rounded-lg border p-6 transition-colors"
          :class="t.cardAlt">
          <div class="flex flex-col gap-4 mb-6">
            <div class="flex items-center gap-4 min-w-0 order-2">
              <div class="w-12 h-12 rounded-lg flex items-center justify-center"
                :class="isDark ? 'bg-emerald-500/10' : 'bg-emerald-50'">
                <svg class="w-6 h-6" :class="t.emeraldText" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h2 class="text-xl font-semibold" :class="t.primaryTextSoft">
                  {{ stub.name || 'Unnamed Stub' }}
                </h2>
                <!--
                  Stub ID line. Always present (every stub has an id),
                  labelled and copyable to mirror the Project ID line below.
                -->
                <div class="flex items-center gap-1.5 mt-0.5">
                  <p class="text-sm font-mono" :class="t.dimText">
                    Stub ID: {{ stub.id }}
                  </p>
                  <BaseCopyButton
                    :text="stub.id"
                    label="stub ID"
                    @copied="showToastMessage('Stub ID copied to clipboard', BaseToastEnum.SUCCESS)"
                    @error="showToastMessage('Failed to copy stub ID', BaseToastEnum.ERROR)"
                  />
                </div>
                <!--
                  Project ID line. Only renders when the stub is a known
                  WireMate-managed mock (existingMock resolved on mount),
                  since raw stubs have no parent project to surface.
                -->
                <div
                  v-if="existingMock?.projectId"
                  class="flex items-center gap-1.5 mt-0.5"
                >
                  <p class="text-sm font-mono" :class="t.dimText">
                    Project ID: {{ existingMock.projectId }}
                  </p>
                  <BaseCopyButton
                    :text="existingMock.projectId"
                    label="project ID"
                    @copied="showToastMessage('Project ID copied to clipboard', BaseToastEnum.SUCCESS)"
                    @error="showToastMessage('Failed to copy project ID', BaseToastEnum.ERROR)"
                  />
                </div>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2 order-1 justify-end">
              <!--
                WireMate mock round-trip. Three states worth rendering
                (loading is implicit — the button is disabled with a
                spinner glyph; error is neutral so a down backend isn't
                mislabelled as 'missing'):
                  exists  → 'WireMate Stub' link into the mock editor
                  missing → 'create WireMate Stub' opens the project
                            picker that POSTs /api/mocks on confirm
                  creating→ disabled, spinner label (the POST fires from
                            within the modal but we already flip status
                            here so the header reflects it)
              -->
              <!--
                When the stub is a WireMate-managed mock we know its parent
                project, so render a sibling link straight to that project's
                detail page. Sits to the left of the "WireMate Stub" button
                so the pair reads "Project · WireMate Stub" — the project is
                the broader context, the mock editor is the deeper one.
                Uses RouterLink (not @click + router.push) so middle-click
                and Ctrl/Cmd-click open the project in a new tab — the
                stub→project jump is one users do a lot while debugging.
              -->
              <RouterLink
                v-if="mockStatus === 'exists' && existingMock?.projectId"
                :to="{ name: 'project', params: { id: existingMock.projectId } }"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                :class="isDark ? 'text-sky-400 hover:bg-sky-500/10' : 'text-sky-600 hover:bg-sky-50'"
                title="Open the WireMate project this stub belongs to"
              >
                <FolderIcon class="w-4 h-4" />
                Project
              </RouterLink>
              <BaseButton
                :color="BaseButtonEnum.SKY"
                :size="BaseButtonSizeEnum.SMALL"
                ghost
                iconLeft
                description="Logs"
                title="View request logs for this stub"
                aria-label="View request logs for this stub"
                @click="viewStubLogs"
              >
                <ClipboardDocumentListIcon class="w-4 h-4 mr-1.5" />
              </BaseButton>
              <BaseButton
                v-if="mockStatus === 'exists'"
                :color="BaseButtonEnum.EMERALD"
                :size="BaseButtonSizeEnum.SMALL"
                ghost
                iconLeft
                description="WireMate Stub"
                title="Open this stub in the WireMate mock editor"
                @click="goToMockEditor"
              >
                <WireMateLogo :size="14" class="mr-1.5" />
              </BaseButton>
              <BaseButton
                v-else-if="mockStatus === 'missing'"
                :color="BaseButtonEnum.AMBER"
                :size="BaseButtonSizeEnum.SMALL"
                ghost
                iconLeft
                description="create WireMate Stub"
                title="Adopt this raw stub into a WireMate project"
                @click="openCreateMockModal"
              >
                <WireMateLogo :size="14" class="mr-1.5" />
              </BaseButton>
              <BaseButton
                v-else-if="mockStatus === 'creating'"
                :color="BaseButtonEnum.AMBER"
                :size="BaseButtonSizeEnum.SMALL"
                ghost
                is-loading
                is-disable
                description="Creating…"
              />
              <BaseButton
                v-else-if="mockStatus === 'loading'"
                :color="BaseButtonEnum.GRAY"
                :size="BaseButtonSizeEnum.SMALL"
                ghost
                is-loading
                is-disable
                description="Checking…"
              />
              <BaseButton
                v-else-if="mockStatus === 'error'"
                :color="BaseButtonEnum.GRAY"
                :size="BaseButtonSizeEnum.SMALL"
                ghost
                iconLeft
                description="Retry check"
                :title="mockStatusError || 'Retry the WireMate mock probe'"
                @click="checkMockExistence"
              >
                <WireMateLogo :size="14" class="mr-1.5" />
              </BaseButton>

              <BaseButton
                :color="BaseButtonEnum.RED"
                :size="BaseButtonSizeEnum.SMALL"
                ghost
                iconLeft
                description="Delete"
                @click="handleDelete"
              >
                <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </BaseButton>
            </div>
          </div>

          <!-- Summary badges -->
          <div class="flex flex-wrap items-center gap-3 mb-6">
            <span :class="methodColor(stub.request.method)" class="px-3 py-1 rounded text-xs font-bold text-white uppercase">
              {{ stub.request.method || 'ANY' }}
            </span>
            <span :class="statusColor(stub.response.status)" class="px-3 py-1 rounded-full text-sm font-semibold">
              {{ stub.response.status || 200 }}
            </span>
            <span v-if="stub.persistent"
              class="text-xs px-2 py-1 rounded font-medium"
              :class="isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-700'">
              Persistent
            </span>
            <span v-if="stub.priority"
              class="text-xs px-2 py-1 rounded font-medium"
              :class="isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'">
              Priority: {{ stub.priority }}
            </span>
          </div>

          <!-- URL -->
          <div class="rounded-lg p-3 mb-4" :class="isDark ? 'bg-gray-800' : 'bg-gray-50'">
            <p class="text-xs uppercase tracking-wide mb-1 font-medium" :class="t.dimText">URL</p>
            <p class="font-mono text-sm break-all" :class="isDark ? 'text-gray-200' : 'text-gray-800'">{{ displayUrl }}</p>
          </div>

          <!-- Metadata (only render the section when at least one field has a value) -->
          <div
            v-if="stub.createdDate || stub.response.fixedDelayMilliseconds"
            class="grid grid-cols-2 gap-4 border-t pt-4"
            :class="isDark ? 'border-gray-700' : 'border-gray-100'"
          >
            <div v-if="stub.createdDate">
              <p class="text-xs uppercase tracking-wide mb-1" :class="t.dimText">Created</p>
              <p class="text-sm" :class="t.label">{{ fmtDate(stub.createdDate) }}</p>
            </div>
            <div v-if="stub.response.fixedDelayMilliseconds">
              <p class="text-xs uppercase tracking-wide mb-1" :class="t.dimText">Response Delay</p>
              <p class="text-sm" :class="t.label">{{ stub.response.fixedDelayMilliseconds }}ms</p>
            </div>
          </div>
        </div>

        <!-- Request section -->
        <div class="mt-6 rounded-lg border transition-colors"
          :class="t.cardAlt">
          <div class="flex items-center justify-between px-6 py-4 border-b" :class="t.border">
            <h3 class="text-base font-semibold" :class="t.primaryTextSoft">Request</h3>
            <button
              @click="copyToClipboard(requestJson, 'Request JSON')"
              class="text-xs font-medium px-2 py-1 rounded transition-colors cursor-pointer"
              :class="isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'"
            >
              Copy
            </button>
          </div>
          <BaseCodeBlock :code="requestJson" class="mx-4 mb-4 mt-2" />
        </div>

        <!-- Response section -->
        <div class="mt-6 rounded-lg border transition-colors"
          :class="t.cardAlt">
          <div class="flex items-center justify-between px-6 py-4 border-b" :class="t.border">
            <h3 class="text-base font-semibold" :class="t.primaryTextSoft">Response</h3>
            <button
              @click="copyToClipboard(responseJson, 'Response JSON')"
              class="text-xs font-medium px-2 py-1 rounded transition-colors cursor-pointer"
              :class="isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'"
            >
              Copy
            </button>
          </div>
          <BaseCodeBlock :code="responseJson" class="mx-4 mb-4 mt-2" />
        </div>

        <!-- Full JSON section -->
        <div class="mt-6 rounded-lg border transition-colors"
          :class="t.cardAlt">
          <div class="flex items-center justify-between px-6 py-4 border-b" :class="t.border">
            <h3 class="text-base font-semibold" :class="t.primaryTextSoft">Full Mapping JSON</h3>
            <button
              @click="copyToClipboard(fullJson, 'Full mapping JSON')"
              class="text-xs font-medium px-2 py-1 rounded transition-colors cursor-pointer"
              :class="isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'"
            >
              Copy
            </button>
          </div>
          <BaseCodeBlock :code="fullJson" max-height-class="max-h-96" class="mx-4 mb-4 mt-2" />
        </div>
      </div>
    </div>

    <!-- Toast Notifications -->
    <BaseToast
      v-if="showToast"
      :description="toastMessage"
      :mode="toastType"
    />

    <!-- Delete confirmation modal -->
    <BaseConfirmModal
      v-if="showDeleteModal"
      title="Delete Stub"
      :message="`Are you sure you want to delete stub '${stub?.name || stub?.id?.substring(0, 8) + '...'}'? This action cannot be undone.`"
      :confirm-text="deleteAlsoMock ? 'Yes, delete both' : 'Yes, delete'"
      cancel-text="Cancel"
      submitting-text="Deleting..."
      variant="danger"
      :submitting="isDeleting"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    >
      <!--
        Orphan warning + opt-in. Only renders when this stub is also a
        known WireMate mock (existingMock resolved). Deleting just the
        stub would leave that mock dangling in the DB, so we surface the
        risk and let the user remove both in one go.
      -->
      <div
        v-if="existingMock"
        class="mt-3 rounded-lg border p-3 text-sm"
        :class="isDark ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-800'"
      >
        <p>
          This stub is also the WireMate mock
          <span class="font-semibold">'{{ existingMock.name }}'</span>.
          Deleting only the stub will leave that mock orphaned in WireMate —
          it stays in its project but is no longer published to WireMock.
        </p>
        <label class="flex items-center gap-2 mt-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            v-model="deleteAlsoMock"
            :disabled="isDeleting"
            class="rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer"
          />
          <span :class="isDark ? 'text-gray-200' : 'text-gray-700'">
            Also delete the linked WireMate mock
          </span>
        </label>
      </div>
    </BaseConfirmModal>

    <!--
      Project picker for adopting this raw stub into WireMate. Lists the
      backend's projects, then POSTs /api/mocks on confirm. The stub is
      created under the user-selected project and its `metadata.projectId`
      is stamped so the round-trip "WireMate Stub" button keeps working.
    -->
    <SelectProjectModal
      v-if="showSelectProjectModal"
      ref="selectProjectModalRef"
      title="Create WireMate Stub"
      message="Pick a project to adopt this stub into. It will be saved as a new WireMate mock using the existing stub id."
      confirm-text="Create"
      submitting-text="Creating..."
      @confirm="handleCreateMock"
      @cancel="closeCreateMockModal"
    />
  </div>
</template>
