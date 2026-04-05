<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BaseActionButton, BaseButton, BaseButtonEnum, BaseButtonSizeEnum, BaseConfirmModal, BaseCopyButton, BaseDropdown, BaseSpinner, BaseTextInputModal, BaseToast, BaseToastEnum, fmtCalendarDateTime, methodBadgeTinted, statusBadgeSoft, useTheme, useThemeClasses, useToast, type DropdownOption } from 'mgv-backoffice'
import { ArrowLeftIcon, FolderIcon, PlusIcon, TrashIcon, MagnifyingGlassIcon, DocumentDuplicateIcon, ArrowRightStartOnRectangleIcon, CodeBracketIcon, ClipboardDocumentListIcon, ArrowUpTrayIcon, ArrowDownTrayIcon, InboxIcon, FaceFrownIcon, AdjustmentsHorizontalIcon, XMarkIcon, LockClosedIcon, ClockIcon, ExclamationTriangleIcon, ArrowsRightLeftIcon, PaperAirplaneIcon, FlagIcon, BookmarkIcon, ChevronDownIcon, CubeIcon, CommandLineIcon, ArrowPathIcon, PencilSquareIcon, CheckIcon, CakeIcon } from '@heroicons/vue/24/outline'
import type { Project } from '../types/project'
import type { MockResponse, StringMatcher, BodyPattern } from '../types/mock'
import { fetchProject, fetchProjects, renameProject } from '../services/projectService'
import { deleteMock, cloneMock, moveMock } from '../services/mockService'
import { mockApi } from '../services/api'
import { checkStubExists } from '../services/stubService'
import { ApiError } from '../services/errors'
import MoveModal from '../components/MoveModal.vue'
import ImportPostmanModal from '../components/ImportPostmanModal.vue'
import { buildPostmanCollection, buildPostmanItemFromMock } from '../utils/postmanExport'
import { logsLinkRouteQuery } from '../utils/logsLink'
import { WIREMOCK_BASE_URL } from '../config'

const route = useRoute()
const router = useRouter()
const { isDark } = useTheme()
const t = useThemeClasses()
const project = ref<Project | null>(null)
const mocks = ref<MockResponse[]>([])
const loading = ref(true)
const error = ref('')
const showDeleteModal = ref(false)
const mockToDelete = ref<MockResponse | null>(null)
const isDeletingMock = ref(false)
const showCloneMockModal = ref(false)
const mockToClone = ref<MockResponse | null>(null)
// BaseTextInputModal takes `submitting` as a prop (not via defineExpose like
// the old in-repo CloneModal did), so we track the loading state on a parent
// ref and pass it down with v-bind.
const cloneMockSubmitting = ref(false)
// Number of projects in the backend — drives the Move button's enabled
// state on each mock card. With < 2 projects there's nowhere to move
// the mock to, so the action is grayed out and shows a tooltip
// explaining why. Refreshed when the user opens this view; the value
// may drift if other tabs add/remove projects, but the MoveModal
// re-fetches on open so the worst case is the button is enabled when
// it shouldn't be (the modal then surfaces "no other projects").
const totalProjectsCount = ref(0)
const hasOtherProjects = computed(() => totalProjectsCount.value > 1)
// True while the project-count fetch that gates the Move button is in
// flight (kicked off when the project opens), so each card's Move action
// can show an in-flight spinner instead of a static, already-decided icon.
const projectsCountLoading = ref(false)

const showMoveModal = ref(false)
const mockToMove = ref<MockResponse | null>(null)
const moveModalRef = ref<InstanceType<typeof MoveModal> | null>(null)
const showImportPostmanModal = ref(false)
const searchQuery = ref('')
const { showToast, toastMessage, toastType, showToastMessage } = useToast()

// Vue Router reuses this component when the user navigates between two
// /projects/:id URLs, so capturing route.params.id as a const at setup
// would leave the view showing the previous project's data. The watcher
// below also re-fires loadMocks() whenever the param changes.
const projectId = computed(() => route.params.id as string)

// Monotonic load-token. Every time we start a fetch we bump it; when the
// fetch resolves we check we're still the most recent caller. This drops
// stale responses on the floor — important because (a) the user can
// switch projects mid-load, and (b) the fire-and-forget stub-probe sweep
// would otherwise keep writing into stubStatuses for the previous
// project's IDs.
let loadToken = 0

// ── Inline project rename ─────────────────────────────────────
// Rather than navigating to a dedicated edit page, the user can rename the
// project right from the detail header: click the pencil → input becomes
// editable → save (Enter / check) PUTs to /api/projects/{id} → on success
// `project.name` updates in place and stays in sync with the URL slug used
// by mocks under this project. Cancel (Esc / X) reverts.
const isEditingProjectName = ref(false)
const projectNameDraft = ref('')
const renamingProject = ref(false)
const renameError = ref('')
const projectNameInput = ref<HTMLInputElement | null>(null)
// Two-step rename: clicking Save stages the new name in
// `pendingProjectName` and opens a confirm modal warning that every
// mock under this project will have the first segment of its URL
// rewritten by the backend. Confirm fires the actual PUT.
const showRenameConfirmModal = ref(false)
const pendingProjectName = ref('')

function startEditProjectName() {
  if (!project.value) return
  projectNameDraft.value = project.value.name
  isEditingProjectName.value = true
  renameError.value = ''
  // Focus the input AFTER Vue commits the v-if swap (so the input
  // element actually exists). Idiomatic alternative to `setTimeout(..., 0)`,
  // which used to fire before the DOM update in some browsers.
  void nextTick(() => {
    projectNameInput.value?.focus()
    projectNameInput.value?.select()
  })
}

function cancelEditProjectName() {
  // Ignore cancel attempts while the rename PUT is in flight. The
  // visible Cancel button is already `:disabled="renamingProject"`, but
  // the Escape-key path (@keyup.esc on the input) doesn't go through
  // that disabled gate, so we belt-and-suspenders here. Otherwise an
  // Escape mid-PUT would close the form while the request finishes,
  // overwriting `project.value.name` on success behind the user's back.
  if (renamingProject.value) return
  isEditingProjectName.value = false
  projectNameDraft.value = ''
  renameError.value = ''
}

function requestSaveProjectName() {
  if (!project.value) return
  const next = projectNameDraft.value.trim()
  if (!next) {
    renameError.value = 'Project name cannot be empty'
    return
  }
  if (next === project.value.name) {
    // No-op: skip the round-trip when the name hasn't actually changed.
    cancelEditProjectName()
    return
  }
  renameError.value = ''
  pendingProjectName.value = next
  showRenameConfirmModal.value = true
}

function cancelRenameConfirm() {
  if (renamingProject.value) return
  showRenameConfirmModal.value = false
  pendingProjectName.value = ''
}

async function saveProjectName() {
  if (!project.value) return
  const next = pendingProjectName.value
  if (!next) return
  renamingProject.value = true
  renameError.value = ''
  try {
    const updated = await renameProject(project.value.id, next)
    // Patch the header label immediately so the rename feels snappy,
    // then re-fetch the project so the mocks list picks up any
    // server-side changes the rename triggered (URLs are namespaced
    // under the project slug, so a rename rewrites every mock's URL on
    // the backend — without a re-fetch the cards would show stale paths).
    project.value = { ...project.value, ...updated, name: updated.name ?? next }
    try {
      const refreshed = await fetchProject(project.value.id)
      project.value = refreshed
      mocks.value = refreshed.mocks ?? []
    } catch (e) {
      // Re-fetch failures are non-fatal — the rename itself succeeded.
      // Warn the user so they know mock URLs may be stale until they refresh.
      console.warn('Stub URL refresh failed after rename:', e)
      showToastMessage(
        'Project renamed, but stub URLs may be stale. Click Refresh to update.',
        BaseToastEnum.WARNING,
      )
    }
    isEditingProjectName.value = false
    showToastMessage(`Project renamed to "${project.value.name}"`, BaseToastEnum.SUCCESS)
  } catch (e) {
    renameError.value = e instanceof Error ? e.message : 'Failed to rename project'
  } finally {
    renamingProject.value = false
    showRenameConfirmModal.value = false
    pendingProjectName.value = ''
  }
}

// ── Advanced filter state ─────────────────────────────────────
// All filters default to "Any" (unset) so returning users see every mock
// until they opt in. `method` and `statusBucket` are single-select; the
// feature flags below are tri-state ("any" | "yes" | "no"), cycled by
// clicking the chip. Keep this list in sync with the chip <button>s in
// the template and the matching section of `filteredMocks`.
const filtersOpen = ref(false)

// Filter dropdown option tables (lib BaseDropdown takes options as data).
const METHOD_FILTER_OPTIONS: DropdownOption[] = [
  { value: '', label: 'Any method' },
  ...['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'TRACE', 'ANY'].map((m) => ({ value: m, label: m })),
]
const STATUS_BUCKET_OPTIONS: DropdownOption[] = [
  { value: '', label: 'Any status' },
  { value: '2xx', label: '2xx — Success' },
  { value: '3xx', label: '3xx — Redirect' },
  { value: '4xx', label: '4xx — Client error' },
  { value: '5xx', label: '5xx — Server error' },
  { value: 'other', label: 'Other' },
]

// The filters panel animates open with the grid-rows 0fr↔1fr trick, which
// needs `overflow-hidden` on the inner wrapper while the tween runs. But
// that same clip would swallow BaseDropdown's floating menus — so overflow
// is released shortly after the panel finishes expanding, and re-clamped
// the moment it starts closing.
const filtersOverflowReleased = ref(false)
let filtersOverflowTimer: ReturnType<typeof setTimeout> | null = null
watch(filtersOpen, (open) => {
  if (filtersOverflowTimer) {
    clearTimeout(filtersOverflowTimer)
    filtersOverflowTimer = null
  }
  if (open) {
    // Matches the wrapper's duration-300 transition, plus a small buffer.
    filtersOverflowTimer = setTimeout(() => {
      filtersOverflowReleased.value = true
    }, 320)
  } else {
    filtersOverflowReleased.value = false
  }
})
const methodFilter = ref<string>('') // '' = any, otherwise HTTP method uppercase
const statusBucketFilter = ref<'' | '2xx' | '3xx' | '4xx' | '5xx' | 'other'>('')

type TriState = 'any' | 'yes' | 'no'
const authFilter = ref<TriState>('any')
const delayFilter = ref<TriState>('any')
const faultFilter = ref<TriState>('any')
const proxyFilter = ref<TriState>('any')
const webhookFilter = ref<TriState>('any')
const cookieFilter = ref<TriState>('any')

const FEATURE_FILTERS: Array<{ label: string; ref: typeof authFilter }> = [
  { label: 'Auth', ref: authFilter },
  { label: 'Delay', ref: delayFilter },
  { label: 'Fault', ref: faultFilter },
  { label: 'Proxy', ref: proxyFilter },
  { label: 'Webhook', ref: webhookFilter },
  { label: 'Cookie', ref: cookieFilter },
]

function cycleTriState(r: typeof authFilter) {
  r.value = r.value === 'any' ? 'yes' : r.value === 'yes' ? 'no' : 'any'
}

// Count of filters currently contributing to the result (used for the
// badge + the empty-state message).
const activeFilterCount = computed(() => {
  let n = 0
  if (searchQuery.value.trim()) n++
  if (methodFilter.value) n++
  if (statusBucketFilter.value) n++
  if (authFilter.value !== 'any') n++
  if (delayFilter.value !== 'any') n++
  if (faultFilter.value !== 'any') n++
  if (proxyFilter.value !== 'any') n++
  if (webhookFilter.value !== 'any') n++
  if (cookieFilter.value !== 'any') n++
  return n
})

function clearAllFilters() {
  searchQuery.value = ''
  methodFilter.value = ''
  statusBucketFilter.value = ''
  authFilter.value = 'any'
  delayFilter.value = 'any'
  faultFilter.value = 'any'
  proxyFilter.value = 'any'
  webhookFilter.value = 'any'
  cookieFilter.value = 'any'
}

// ── Per-mock feature detectors ────────────────────────────────
// Helpers that keep `filteredMocks` legible. Each returns whether a given
// mock "has" the feature represented by that filter.
function mockHasAuth(m: MockResponse): boolean {
  const c = m.request.basicAuthCredentials
  return !!c && !!(c.username || c.password)
}
function mockHasDelay(m: MockResponse): boolean {
  const r = m.response
  if (typeof r.fixedDelayMilliseconds === 'number' && r.fixedDelayMilliseconds > 0) return true
  if (r.delayDistribution) return true
  if (r.chunkedDribbleDelay) return true
  return false
}
function mockHasFault(m: MockResponse): boolean {
  return !!m.response.fault
}
function mockHasProxy(m: MockResponse): boolean {
  return !!m.response.proxyBaseUrl
}
function mockHasCookie(m: MockResponse): boolean {
  // A request-side cookie matcher — the stub matches against the incoming
  // Cookie header. Treat the feature as present whenever at least one
  // cookie key is configured.
  const c = m.request.cookies
  return !!c && Object.keys(c).length > 0
}
function mockHasWebhook(m: MockResponse): boolean {
  // Modern (WireMock 3.1.0+) shape: the stub carries a `serveEventListeners`
  // array and webhook config lives in the entry whose `name` is `"webhook"`.
  // We only treat a listener as "configured" when its parameters include a
  // URL — an empty listener stub is a no-op and shouldn't light up the badge
  // or the filter.
  const fromListener = m.serveEventListeners?.some(
    l => l.name === 'webhook' && typeof (l.parameters as { url?: unknown })?.url === 'string' && (l.parameters as { url: string }).url.trim() !== '',
  )
  if (fromListener) return true
  // Legacy (pre-3.1.0) shape — kept so stubs saved before the migration
  // still show the chip and match the filter. On next save they're rewritten
  // to `serveEventListeners` by CreateMock.vue.
  return !!m.postServeActions?.webhook?.url
}
function matchesTri(flag: TriState, has: boolean): boolean {
  return flag === 'any' || (flag === 'yes' ? has : !has)
}
function statusBucket(status: number): '2xx' | '3xx' | '4xx' | '5xx' | 'other' {
  if (status >= 200 && status < 300) return '2xx'
  if (status >= 300 && status < 400) return '3xx'
  if (status >= 400 && status < 500) return '4xx'
  if (status >= 500 && status < 600) return '5xx'
  return 'other'
}

const filteredMocks = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  return mocks.value.filter(mock => {
    // Text search (name or URL)
    if (query) {
      const name = mock.name.toLowerCase()
      const url = getMockUrl(mock).toLowerCase()
      if (!name.includes(query) && !url.includes(query)) return false
    }
    // HTTP method
    if (methodFilter.value && mock.request.method !== methodFilter.value) return false
    // Status bucket
    if (statusBucketFilter.value && statusBucket(mock.response.status) !== statusBucketFilter.value) return false
    // Tri-state feature toggles
    if (!matchesTri(authFilter.value, mockHasAuth(mock))) return false
    if (!matchesTri(delayFilter.value, mockHasDelay(mock))) return false
    if (!matchesTri(faultFilter.value, mockHasFault(mock))) return false
    if (!matchesTri(proxyFilter.value, mockHasProxy(mock))) return false
    if (!matchesTri(webhookFilter.value, mockHasWebhook(mock))) return false
    if (!matchesTri(cookieFilter.value, mockHasCookie(mock))) return false
    return true
  })
})

// Number of mocks in this project whose WireMock stub probe came back
// 404 ('missing'). Surfaced on the "Test in Postman" button so the user
// knows up-front that some mocks won't be in the exported collection,
// and consumed by `exportAllMocksAsPostman` to skip those mocks. Only
// counts strict 'missing' — 'loading'/'creating'/'error' are ambiguous
// states we don't want to silently drop from the export.
const missingStubCount = computed(() => {
  return mocks.value.filter(m =>
    m.projectId === projectId.value && stubStatuses.value[m.id] === 'missing',
  ).length
})

// ── Grouping by URL ──────────────────────────────────────────
// Mocks that target the same URL often compete for the same incoming
// request — WireMock picks the one with the lowest `priority` (lower =
// higher precedence). Flattening them into a blind list makes it easy
// to miss several cards share a URL, so we bucket by URL and let the
// template render a collapsible frame around each 2+-mock cluster.
// Within each group the mocks are sorted by `priority` ascending; mocks
// without an explicit priority land at the bottom (WireMock defaults
// them to 5, but older data may not carry the field).
interface MockGroup {
  url: string
  mocks: MockResponse[]
  // True iff this group represents an actual URL collision (2+ mocks).
  // Single-mock "groups" render flush with the grid — no frame, no header.
  inGroup: boolean
}

const groupedFilteredMocks = computed<MockGroup[]>(() => {
  // Preserve first-seen order of URL buckets (Map keeps insertion order)
  // so the list doesn't reshuffle as new mocks land — only the
  // within-bucket ordering changes.
  const buckets = new Map<string, MockResponse[]>()
  for (const m of filteredMocks.value) {
    const url = getMockUrl(m)
    const arr = buckets.get(url)
    if (arr) arr.push(m)
    else buckets.set(url, [m])
  }

  const byPriorityAsc = (a: MockResponse, b: MockResponse) => {
    const ap = typeof a.priority === 'number' ? a.priority : Number.POSITIVE_INFINITY
    const bp = typeof b.priority === 'number' ? b.priority : Number.POSITIVE_INFINITY
    if (ap !== bp) return ap - bp
    // Stable tiebreaker on name so equal priorities render deterministically.
    return a.name.localeCompare(b.name)
  }

  const out: MockGroup[] = []
  for (const [url, members] of buckets) {
    const sorted = members.slice().sort(byPriorityAsc)
    out.push({
      url,
      mocks: sorted,
      inGroup: sorted.length > 1,
    })
  }
  return out
})

// URLs whose group is currently collapsed. Defaults to empty (expanded).
// Held as a Set so toggling is O(1); we clone on write so Vue picks up
// the reactivity.
const collapsedGroups = ref<Set<string>>(new Set())

function toggleGroupCollapse(url: string) {
  const next = new Set(collapsedGroups.value)
  if (next.has(url)) next.delete(url)
  else next.add(url)
  collapsedGroups.value = next
}

function isGroupCollapsed(url: string): boolean {
  return collapsedGroups.value.has(url)
}

async function loadProject() {
  const token = ++loadToken
  loading.value = true
  error.value = ''
  // Reset per-project derived state so the previous project's chips
  // don't briefly bleed into the new view while the fresh fetch is
  // in flight.
  stubStatuses.value = {}
  try {
    const data = await fetchProject(projectId.value)
    if (token !== loadToken) return     // a newer load superseded us
    project.value = data
    mocks.value = data.mocks ?? []
  } catch (e) {
    if (token !== loadToken) return
    // A 404 means the project id isn't in the database (deleted, or a stale
    // link). Say so explicitly; any other failure is a generic load error.
    error.value = e instanceof ApiError && e.status === 404
      ? 'This project was not found in the database.'
      : 'Failed to load project details'
  } finally {
    if (token === loadToken) loading.value = false
  }
  // Side-quest: count total projects so the Move button on each mock card
  // can be grayed out when there's nowhere to move to. Failures are
  // non-fatal — leaving the count at 0 hides the Move button entirely,
  // which is acceptable when we can't tell whether other projects exist.
  projectsCountLoading.value = true
  fetchProjects()
    .then(all => { if (token === loadToken) totalProjectsCount.value = all.length })
    .catch(() => { /* leave count at 0; Move button stays disabled */ })
    .finally(() => { if (token === loadToken) projectsCountLoading.value = false })
  // Kick off the per-mock WireMock stub existence check in the background
  // so the identity row can render "stub exists" / "stub missing" chips.
  // We don't await this — the mocks list should render immediately, and
  // the chips fade in as results arrive.
  void refreshAllStubStatuses(token)
}

onMounted(loadProject)

// Re-fetch when the user navigates to a different project URL while this
// component is reused by Vue Router. `immediate: false` because
// onMounted() above already kicks off the initial load.
watch(projectId, (id, prev) => {
  if (id && id !== prev) {
    void loadProject()
  }
})

// `silent: true` skips the page-wide loading spinner. The template hides
// the whole project-details branch while `loading` is true and replaces it
// with a centered <BaseSpinner>, which collapses the page and resets the
// user's scroll position. For background re-fetches triggered by an
// in-card action (e.g. "click to create" from createStubForMock), we want
// the data to refresh underneath the user without yanking them to the top.
//
// `skipStubStatuses: true` skips the per-mock WireMock probe sweep that
// normally runs at the tail of this function. The probe sweep fires one
// GET /__admin/mappings/{id} per mock, so re-running it after every
// in-page mutation (e.g. right after a successful click-to-create
// republish) is wasteful: we already know the just-republished stub
// exists, and the other mocks' statuses haven't changed. The on-mount
// sweep is the one source of truth for "is this stub on WireMock right
// now"; everything else updates that ref directly.
async function loadMocks(opts: { silent?: boolean; skipStubStatuses?: boolean } = {}) {
  const token = ++loadToken
  if (!opts.silent) {
    loading.value = true
  }
  error.value = ''
  try {
    const data = await fetchProject(projectId.value)
    if (token !== loadToken) return
    project.value = data
    mocks.value = data.mocks ?? []
  } catch (e) {
    if (token !== loadToken) return
    error.value = e instanceof ApiError && e.status === 404
      ? 'This project was not found in the database.'
      : 'Failed to load project'
  } finally {
    if (token === loadToken && !opts.silent) {
      loading.value = false
    }
  }
  if (!opts.skipStubStatuses) {
    void refreshAllStubStatuses(token)
  }
}

// ── Per-mock WireMock stub status ───────────────────────────────
// For each mock we track whether a matching stub currently lives on the
// WireMock admin side. The backend creates stubs alongside mocks, but
// WireMock is ephemeral in a lot of setups (in-memory resets, container
// restarts) and can drift from our DB — surfacing the delta in-card
// lets users spot & fix the gap without leaving the project page.
//
// States:
//   'loading'  — check in flight
//   'exists'   — GET /__admin/mappings/{id} returned 200
//   'missing'  — returned 404, user can re-push the stub
//   'creating' — POST /__admin/mappings in flight after a user click
//   'error'    — the admin port didn't respond with 200/404 (network
//                down, CORS, auth). Rendered as a neutral warning so we
//                don't mislabel an unreachable server as "missing".
type StubStatus = 'loading' | 'exists' | 'missing' | 'creating' | 'error'
const stubStatuses = ref<Record<string, StubStatus>>({})

async function refreshStubStatus(mockId: string, token?: number) {
  const startToken = token ?? loadToken
  stubStatuses.value = { ...stubStatuses.value, [mockId]: 'loading' }
  try {
    const exists = await checkStubExists(mockId)
    if (startToken !== loadToken) return
    stubStatuses.value = { ...stubStatuses.value, [mockId]: exists ? 'exists' : 'missing' }
  } catch (_e) {
    if (startToken !== loadToken) return
    stubStatuses.value = { ...stubStatuses.value, [mockId]: 'error' }
  }
}

// Cap how many stub-existence probes run in parallel. WireMock's admin
// port sits behind a small Jetty thread pool and starts returning 503
// when it sees more than a handful of in-flight requests, so firing a
// probe per mock all at once (6+ at page load) causes the majority to
// bounce and makes the stub chip flicker between 'error' and 'missing'.
// A small concurrency window keeps the UI snappy — each chip still
// updates as its own probe resolves — without overrunning the admin
// port's capacity.
const STUB_PROBE_CONCURRENCY = 3

async function refreshAllStubStatuses(token?: number) {
  // Snapshot the load-token at start. If it changes (the user navigated
  // to another project, or another loadMocks() was kicked off), each
  // worker bails before writing to stubStatuses — otherwise we'd leak
  // probes from one project into another.
  const startToken = token ?? loadToken
  const items = mocks.value.slice()
  let cursor = 0
  const workers = Array.from({ length: Math.min(STUB_PROBE_CONCURRENCY, items.length) }, async () => {
    while (true) {
      if (startToken !== loadToken) return
      const idx = cursor++
      if (idx >= items.length) return
      await refreshStubStatus(items[idx].id, startToken)
    }
  })
  await Promise.all(workers)
}

async function createStubForMock(mock: MockResponse) {
  stubStatuses.value = { ...stubStatuses.value, [mock.id]: 'creating' }
  try {
    // Route the re-install through the WireMate backend rather than
    // hitting the WireMock admin API directly — the backend handles
    // the WireMock sync on its side, so we get a single source of
    // truth instead of the UI writing to two stores.
    //
    // We use PUT /api/mocks/{id} (not POST /api/mocks) because the
    // mock row already exists in our DB — only the WireMock-side
    // stub is missing. PUT preserves the id so the stub lands back
    // on WireMock under the same id the rest of the UI references,
    // whereas POST would mint a fresh duplicate.
    await mockApi.republish(mock.id)
    stubStatuses.value = { ...stubStatuses.value, [mock.id]: 'exists' }
    showToastMessage(`Stub created for '${mock.name}'`, BaseToastEnum.SUCCESS)
    // Re-fetch so any server-side side effects (updated timestamps,
    // metadata touch-ups) show up in the list.
    //   - `silent: true` keeps the mocks list mounted so the user stays
    //     scrolled where they were when they clicked — flipping the
    //     page-wide `loading` would swap the list out for a centered
    //     spinner and reset scroll to the top.
    //   - `skipStubStatuses: true` suppresses the per-mock
    //     GET /__admin/mappings/{id} probe sweep. We already set this
    //     mock's status to 'exists' above, and the on-mount sweep is the
    //     authoritative refresh — re-probing every mock after a single
    //     click-to-create is wasted traffic against WireMock's admin port.
    await loadMocks({ silent: true, skipStubStatuses: true })
  } catch (e) {
    // Revert to 'missing' so the user can retry; they're the ones who
    // bumped us out of it.
    stubStatuses.value = { ...stubStatuses.value, [mock.id]: 'missing' }
    showToastMessage(
      e instanceof Error ? `Failed to create stub: ${e.message}` : 'Failed to create stub',
      BaseToastEnum.ERROR,
    )
  }
}

function goBack() {
  router.push({ name: 'projects' })
}

// Navigates to the standalone Create Mock page, pre-binding the form to
// this project via a query param. CreateMock.vue hides its Project ID
// input when the prop is present, and on success the view routes back
// to this project so the user lands on the new mock in context.
function openCreateMock() {
  if (!project.value) return
  router.push({
    name: 'create-mock',
    query: { projectId: project.value.id },
  })
}

// "Mon D, YYYY, HH:MM" label — lib formatter.
const formatDate = fmtCalendarDateTime

// Per-method tinted hue — lib helper (blue GET, emerald POST, amber PUT,
// red DELETE, purple PATCH, sky HEAD, gray otherwise).
const methodColor = (method: string) => methodBadgeTinted(method, isDark.value)

function getMockUrl(mock: MockResponse): string {
  return mock.request.url || mock.request.urlPath || mock.request.urlPattern || mock.request.urlPathPattern || '—'
}

// Extract the response Content-Type header, preferring the stub's own
// advertisement over any body-shape sniffing. Matches case-insensitively
// because headers are case-insensitive on the wire and we've seen users
// enter any of "Content-Type", "content-type", "CONTENT-TYPE".
//
// Returns the first non-empty value; multi-valued headers (string[])
// reuse the first entry — a response Content-Type is never legitimately
// more than one value.
function responseContentType(mock: MockResponse): string | null {
  const headers = mock.response.headers
  if (!headers) return null
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== 'content-type') continue
    const raw = Array.isArray(value) ? value[0] : value
    const trimmed = typeof raw === 'string' ? raw.trim() : ''
    if (trimmed) return trimmed
  }
  return null
}

// Describes a response body's shape (JSON / XML / text / empty) so the card
// can hint at the payload type without dumping the body itself.
function responseBodyKind(mock: MockResponse): string | null {
  const r = mock.response
  if (r.jsonBody !== undefined && r.jsonBody !== null) return 'JSON'
  if (typeof r.bodyFileName === 'string' && r.bodyFileName.trim()) return 'File'
  if (typeof r.base64Body === 'string' && r.base64Body.trim()) return 'Binary'
  const body = typeof r.body === 'string' ? r.body.trim() : ''
  if (!body) return null
  // Sniff JSON/XML without parsing — cheap and good enough for a hint.
  if ((body.startsWith('{') && body.endsWith('}')) || (body.startsWith('[') && body.endsWith(']'))) return 'JSON'
  if (body.startsWith('<') && body.endsWith('>')) return 'XML'
  return 'Text'
}

// Returns the human-readable delay summary, or null if no delay configured.
function formatDelay(mock: MockResponse): string | null {
  const r = mock.response
  if (typeof r.fixedDelayMilliseconds === 'number' && r.fixedDelayMilliseconds > 0) {
    const ms = r.fixedDelayMilliseconds
    return ms >= 1000 ? `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s` : `${ms}ms`
  }
  if (r.delayDistribution) return 'random'
  if (r.chunkedDribbleDelay) return 'chunked'
  return null
}

// ── Card detail summaries ────────────────────────────────────
// `requestSummary` / `responseSummary` produce the rows rendered in the
// two-box detail strip on each mock card. Each entry is `{ label, value }`
// and gets its own row in the card — collections like headers and query
// params are expanded so the user sees the actual names + matchers
// inline instead of a collapsed `Headers: 3` count.

interface DetailRow { label: string; value: string }

// Compact, human-readable rendering of a WireMock StringMatcher. The
// label flags the matcher kind and the value (or absence sentinel) is
// shown right after — e.g. `~ ^/api/.+`, `= active`, `(absent)`.
function summarizeStringMatcher(m: StringMatcher | undefined | null): string {
  if (!m) return '—'
  if (m.absent) return '(absent)'
  if (typeof m.equalTo === 'string') return `= ${m.equalTo}`
  if (typeof m.contains === 'string') return `*= ${m.contains}`
  if (typeof m.matches === 'string') return `~ ${m.matches}`
  if (typeof m.doesNotMatch === 'string') return `!~ ${m.doesNotMatch}`
  if (typeof m.equalToJson === 'string') return `=json ${m.equalToJson}`
  if (typeof m.equalToXml === 'string') return `=xml ${m.equalToXml}`
  if (typeof m.binaryEqualTo === 'string') return `=bin ${m.binaryEqualTo}`
  if (m.matchesJsonPath !== undefined) {
    const expr = typeof m.matchesJsonPath === 'string' ? m.matchesJsonPath : m.matchesJsonPath.expression
    return `jsonPath ${expr}`
  }
  if (m.matchesXPath !== undefined) {
    const expr = typeof m.matchesXPath === 'string' ? m.matchesXPath : m.matchesXPath.expression
    return `xPath ${expr}`
  }
  if (typeof m.before === 'string') return `before ${m.before}`
  if (typeof m.after === 'string') return `after ${m.after}`
  if (typeof m.equalToDateTime === 'string') return `=dt ${m.equalToDateTime}`
  return '—'
}

// Same idea for body-pattern entries. They share most fields with
// StringMatcher but live in an unkeyed array, so we add a `[i]` label
// upstream and just render the matcher contents here.
function summarizeBodyPattern(p: BodyPattern): string {
  if (p.absent) return '(absent)'
  if (typeof p.equalTo === 'string') return `= ${p.equalTo}`
  if (typeof p.contains === 'string') return `*= ${p.contains}`
  if (typeof p.matches === 'string') return `~ ${p.matches}`
  if (typeof p.doesNotMatch === 'string') return `!~ ${p.doesNotMatch}`
  if (p.equalToJson !== undefined) {
    const v = typeof p.equalToJson === 'string' ? p.equalToJson : JSON.stringify(p.equalToJson)
    return `=json ${v}`
  }
  if (p.matchesJsonSchema !== undefined) {
    const v = typeof p.matchesJsonSchema === 'string' ? p.matchesJsonSchema : JSON.stringify(p.matchesJsonSchema)
    return `jsonSchema ${v}`
  }
  if (p.matchesJsonPath !== undefined) {
    const expr = typeof p.matchesJsonPath === 'string' ? p.matchesJsonPath : p.matchesJsonPath.expression
    return `jsonPath ${expr}`
  }
  if (typeof p.equalToXml === 'string') return `=xml ${p.equalToXml}`
  if (p.matchesXPath !== undefined) {
    const expr = typeof p.matchesXPath === 'string' ? p.matchesXPath : p.matchesXPath.expression
    return `xPath ${expr}`
  }
  if (typeof p.binaryEqualTo === 'string') return `=bin ${p.binaryEqualTo}`
  if (typeof p.before === 'string') return `before ${p.before}`
  if (typeof p.after === 'string') return `after ${p.after}`
  if (typeof p.equalToDateTime === 'string') return `=dt ${p.equalToDateTime}`
  return '—'
}

function requestSummary(mock: MockResponse): DetailRow[] {
  const rows: DetailRow[] = []
  const req = mock.request
  rows.push({ label: 'Method', value: req.method })
  rows.push({ label: 'Match', value: urlMatchLabel(mock) })
  if (req.headers) {
    for (const [name, matcher] of Object.entries(req.headers)) {
      rows.push({ label: name, value: summarizeStringMatcher(matcher) })
    }
  }
  if (req.queryParameters) {
    for (const [name, matcher] of Object.entries(req.queryParameters)) {
      rows.push({ label: `?${name}`, value: summarizeStringMatcher(matcher) })
    }
  }
  if (req.cookies) {
    for (const [name, matcher] of Object.entries(req.cookies)) {
      rows.push({ label: `cookie:${name}`, value: summarizeStringMatcher(matcher) })
    }
  }
  if (Array.isArray(req.bodyPatterns)) {
    req.bodyPatterns.forEach((p, i) => {
      rows.push({ label: `Body[${i}]`, value: summarizeBodyPattern(p) })
    })
  }
  if (req.basicAuthCredentials?.username) rows.push({ label: 'Basic auth', value: req.basicAuthCredentials.username })
  if (req.customMatcher?.name) rows.push({ label: 'Custom matcher', value: req.customMatcher.name })
  return rows
}

function responseSummary(mock: MockResponse): DetailRow[] {
  const rows: DetailRow[] = []
  const res = mock.response
  const statusLabel = res.statusMessage ? `${res.status} ${res.statusMessage}` : String(res.status)
  rows.push({ label: 'Status', value: statusLabel })
  const bodyKind = responseBodyKind(mock)
  if (bodyKind) rows.push({ label: 'Body', value: bodyKind })
  if (res.headers) {
    for (const [name, value] of Object.entries(res.headers)) {
      const rendered = Array.isArray(value) ? value.join(', ') : String(value)
      rows.push({ label: name, value: rendered })
    }
  }
  const delay = formatDelay(mock)
  if (delay) rows.push({ label: 'Delay', value: delay })
  if (Array.isArray(res.transformers) && res.transformers.length > 0) {
    res.transformers.forEach(t => rows.push({ label: 'Transformer', value: t }))
  }
  if (res.fault) rows.push({ label: 'Fault', value: res.fault })
  if (res.proxyBaseUrl) rows.push({ label: 'Proxy', value: res.proxyBaseUrl })
  return rows
}

// Feature descriptor — keeps the template lean by centralising icon, tooltip,
// and detection rules. Only features that apply to the mock are rendered.
// `prominent` flags features that deserve top-billing (auth + fault): these
// surface in the header row next to method/status so callers can spot
// security/error behaviours without scanning the chip stack further down.
interface FeatureChip {
  key: string
  label: string
  title: string
  icon: unknown
  lightClasses: string
  darkClasses: string
  prominent?: boolean
}

function mockFeatureChips(mock: MockResponse): FeatureChip[] {
  const chips: FeatureChip[] = []
  if (mockHasAuth(mock)) {
    chips.push({
      key: 'auth',
      label: 'Auth',
      title: 'Basic authentication required',
      icon: LockClosedIcon,
      lightClasses: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      darkClasses: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
      prominent: true,
    })
  }
  if (mockHasFault(mock)) {
    chips.push({
      key: 'fault',
      label: mock.response.fault ?? 'Fault',
      title: 'Fault simulation enabled',
      icon: ExclamationTriangleIcon,
      lightClasses: 'bg-red-50 text-red-700 border-red-200',
      darkClasses: 'bg-red-500/10 text-red-300 border-red-500/30',
      prominent: true,
    })
  }
  const delay = formatDelay(mock)
  if (delay) {
    chips.push({
      key: 'delay',
      label: `Delay · ${delay}`,
      // Surface chunked-dribble specifically in the tooltip so reviewers
      // reading the top row know *why* the chip is there — "chunked" on
      // its own is cryptic without the wider "trickle the body over N
      // chunks" context.
      title: delay === 'chunked'
        ? 'Chunked dribble delay — response body is trickled in parts'
        : 'Response delay configured',
      icon: ClockIcon,
      lightClasses: 'bg-amber-50 text-amber-700 border-amber-200',
      darkClasses: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
      // Delay (including chunked dribble) is promoted to the top of the
      // card alongside auth/fault so latency-shaping behaviour is visible
      // at-a-glance, not buried in the secondary chip grid.
      prominent: true,
    })
  }
  if (mockHasProxy(mock)) {
    chips.push({
      key: 'proxy',
      label: 'Proxy',
      title: mock.response.proxyBaseUrl ?? 'Proxy to upstream',
      icon: ArrowsRightLeftIcon,
      lightClasses: 'bg-sky-50 text-sky-700 border-sky-200',
      darkClasses: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
    })
  }
  if (mockHasWebhook(mock)) {
    chips.push({
      key: 'webhook',
      label: 'Webhook',
      title: 'Post-serve webhook configured',
      icon: PaperAirplaneIcon,
      lightClasses: 'bg-teal-50 text-teal-700 border-teal-200',
      darkClasses: 'bg-teal-500/10 text-teal-300 border-teal-500/30',
      // Promoted to the top identity row alongside auth/fault/delay so
      // the side-effect behaviour of a stub (it fires an outbound call
      // after serving) is visible without opening the card. The chip
      // rail rendered via `prominentChips` is the only place feature
      // chips surface — non-prominent chips would never render.
      prominent: true,
    })
  }
  if (mockHasCookie(mock)) {
    chips.push({
      key: 'cookie',
      label: 'Cookie',
      title: 'Matches against a request Cookie header',
      icon: CakeIcon,
      lightClasses: 'bg-purple-50 text-purple-700 border-purple-200',
      darkClasses: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
      // Promoted to the top identity row alongside auth/fault/delay/webhook
      // so cookie-based matching is visible without opening the card — only
      // prominent chips are rendered (see prominentChips).
      prominent: true,
    })
  }
  const body = responseBodyKind(mock)
  if (body) {
    chips.push({
      key: 'body',
      label: body,
      title: `Response body type: ${body}`,
      icon: CodeBracketIcon,
      lightClasses: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      darkClasses: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    })
  }
  return chips
}

// All feature chips currently render in the top identity row via
// `prominentChips` — there's no secondary chip strip anymore, so a
// companion `regularChips` helper would be dead code and is omitted.
function prominentChips(mock: MockResponse): FeatureChip[] {
  return mockFeatureChips(mock).filter(c => c.prominent)
}

// Human label for the URL match type — surfaces how picky the match is so
// developers don't have to open the mock to find out it's a regex.
function urlMatchLabel(mock: MockResponse): string {
  const r = mock.request
  if (r.urlPattern) return 'regex'
  if (r.urlPathPattern) return 'path regex'
  if (r.urlPath) return 'path'
  if (r.url) return 'exact'
  return 'any'
}

// Soft status badge keyed by status class — lib helper.
const statusBadgeClasses = (status: number) => statusBadgeSoft(status, isDark.value)

// Priority badge colours scale with precedence: lower number = higher
// precedence (WireMock evaluates lower-priority stubs first), so we use
// warmer/stronger tones for the more "important" buckets and cooler/softer
// tones as the number climbs. Keeps the chip readable while doubling as
// a quick visual ranking when scanning a long list of mocks.
function priorityBadgeClasses(priority: number): string {
  if (priority <= 1) {
    return isDark.value
      ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
      : 'bg-rose-50 text-rose-700 border-rose-200'
  }
  if (priority <= 3) {
    return isDark.value
      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
      : 'bg-amber-50 text-amber-700 border-amber-200'
  }
  if (priority <= 5) {
    return isDark.value
      ? 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30'
      : 'bg-yellow-50 text-yellow-700 border-yellow-200'
  }
  if (priority <= 10) {
    return isDark.value
      ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
      : 'bg-sky-50 text-sky-700 border-sky-200'
  }
  return isDark.value
    ? 'bg-slate-500/15 text-slate-300 border-slate-500/30'
    : 'bg-slate-50 text-slate-700 border-slate-200'
}

function editMock(mock: MockResponse) {
  router.push({ name: 'edit-mock', params: { id: projectId.value, mockId: mock.id } })
}

function viewMockLogs(mock: MockResponse) {
  // Pass the mock's url matcher type through as `urlMatch` so the Logs
  // page filters with the same matcher (see logsLinkRouteQuery).
  router.push({ name: 'logs', query: logsLinkRouteQuery(mock.request, mock.name) })
}

// Opens the raw WireMock stub for a mock at /stubs/:id. The mock's id matches
// the stub's id on the WireMock side, so we can route directly without any
// extra lookup. Handy for inspecting the wire-level payload or checking what
// WireMock actually stored vs. what the UI thinks it stored.
function viewMockStub(mock: MockResponse) {
  router.push({ name: 'stub-detail', params: { id: mock.id } })
}

// Copy the backend-persisted `curl` invocation for this mock. We use the
// stored value rather than regenerating from the current state because
// regeneration would drift if the stub was edited through the raw
// WireMock admin API (in which case the mock row in our DB may be
// stale but its stored curl still reflects the last known-good form).
// Falls back to the async Clipboard API where available; logs a toast on
// either success or failure so users always get feedback.
async function copyCurlFromMock(mock: MockResponse) {
  const curl = mock.curl?.trim()
  if (!curl) {
    showToastMessage('No cURL available for this mock', BaseToastEnum.ERROR)
    return
  }
  try {
    await navigator.clipboard.writeText(curl)
    showToastMessage('cURL copied to clipboard', BaseToastEnum.SUCCESS)
  } catch (_e) {
    showToastMessage('Failed to copy cURL to clipboard', BaseToastEnum.ERROR)
  }
}

function handleDeleteMock(mock: MockResponse) {
  mockToDelete.value = mock
  showDeleteModal.value = true
}

async function confirmDeleteMock() {
  if (!mockToDelete.value || isDeletingMock.value) return
  isDeletingMock.value = true
  try {
    await deleteMock(mockToDelete.value.id)
    mocks.value = mocks.value.filter(m => m.id !== mockToDelete.value!.id)
    showToastMessage('Mock deleted', BaseToastEnum.SUCCESS)
  } catch (e) {
    // Recoverable per-action error -> toast. Writing to the page-level
    // `error` ref here would wipe the whole ProjectDetail view for what
    // is typically a transient backend failure.
    showToastMessage(
      e instanceof Error ? e.message : 'Failed to delete mock',
      BaseToastEnum.ERROR,
    )
  } finally {
    isDeletingMock.value = false
    showDeleteModal.value = false
    mockToDelete.value = null
  }
}

function cancelDeleteMock() {
  if (isDeletingMock.value) return
  showDeleteModal.value = false
  mockToDelete.value = null
}

// Suggested name prefilled in the clone modal. We append a fresh UUID
// rather than a generic "(copy)" suffix so repeated clones of the same
// mock produce unique, non-colliding names without the user having to
// edit the field themselves. Regenerated each time the modal opens so
// two clones from the same source mock never collide.
const cloneSuggestedName = ref('')

function handleCloneMock(mock: MockResponse) {
  mockToClone.value = mock
  cloneSuggestedName.value = `${mock.name} ${crypto.randomUUID()}`
  showCloneMockModal.value = true
}

async function confirmCloneMock(name: string) {
  if (!mockToClone.value) return
  cloneMockSubmitting.value = true
  try {
    await cloneMock(mockToClone.value.id, { name })
    // Re-fetch the full list so the UI reflects authoritative server state
    // (order, metadata, any server-side side effects) rather than just
    // appending the cloned mock locally.
    await loadMocks()
    showToastMessage(`Mock cloned as '${name}'`, BaseToastEnum.SUCCESS)
  } catch (e) {
    // Per-action error -> toast, NOT the page-level fatal `error` ref.
    // Writing to `error` here used to wipe the entire ProjectDetail view
    // for a recoverable backend validation (e.g. duplicate-name 400),
    // forcing the user back to the project list. Move it lives at L782
    // already does the right thing with a toast; mirror that.
    showToastMessage(
      e instanceof Error ? e.message : 'Failed to clone mock',
      BaseToastEnum.ERROR,
    )
  } finally {
    cloneMockSubmitting.value = false
    showCloneMockModal.value = false
    mockToClone.value = null
  }
}

function cancelCloneMock() {
  showCloneMockModal.value = false
  mockToClone.value = null
}

function handleMoveMock(mock: MockResponse) {
  mockToMove.value = mock
  showMoveModal.value = true
}

async function confirmMoveMock(targetProjectId: string) {
  if (!mockToMove.value || !moveModalRef.value) return
  moveModalRef.value.submitting = true
  try {
    await moveMock(mockToMove.value.id, { targetProjectId })
    const movedMockName = mockToMove.value.name
    mocks.value = mocks.value.filter(m => m.id !== mockToMove.value!.id)
    showToastMessage(`Mock '${movedMockName}' moved successfully`, BaseToastEnum.SUCCESS)
  } catch (e) {
    showToastMessage(e instanceof Error ? e.message : 'Failed to move mock', BaseToastEnum.ERROR)
  } finally {
    if (moveModalRef.value) moveModalRef.value.submitting = false
    showMoveModal.value = false
    mockToMove.value = null
  }
}

function cancelMoveMock() {
  showMoveModal.value = false
  mockToMove.value = null
}

function openImportPostman() {
  showImportPostmanModal.value = true
}

async function onPostmanImported(count: number) {
  showImportPostmanModal.value = false
  // Surface a top-level success toast once the modal closes. The modal
  // shows its own inline "Imported X of Y" summary while the import is
  // running, but as soon as the user dismisses it that confirmation is
  // gone — without this toast there's no breadcrumb that the action
  // actually landed, especially if the freshly imported mocks render
  // off-screen (long lists, applied filters, etc.).
  if (count > 0) {
    showToastMessage(
      `Imported ${count} stub${count === 1 ? '' : 's'} from Postman collection`,
      BaseToastEnum.SUCCESS,
    )
  }
  await loadMocks()
}

function onPostmanCancel() {
  showImportPostmanModal.value = false
}

// ── Postman collection export ─────────────────────────────────────
// Exports produce a Postman Collection v2.1 so the JSON can be imported
// directly via Postman → File → Import. Single-mock export wraps one mock
// in a one-item collection (Postman requires a collection, not a bare item).

function triggerDownload(filename: string, payload: unknown) {
  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function exportMockAsPostman(mock: MockResponse) {
  const item = buildPostmanItemFromMock(mock, WIREMOCK_BASE_URL)
  const collection = {
    info: {
      name: mock.name,
      description: 'Exported from WireMate. Single-mock Postman collection.',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: [item],
  }
  const safe = mock.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'mock'
  triggerDownload(`${safe}.postman_collection.json`, collection)
}

function exportAllMocksAsPostman() {
  // Scope the export strictly to mocks owned by the current project AND
  // backed by an actual stub on WireMock. A Postman request fired against
  // a mock that doesn't have a stub will just hit a 404, so including
  // those entries makes the exported collection useless as a "test these
  // mocks" artifact — silently drop them.
  //
  // Only `'missing'` is treated as "definitely no stub": 'loading',
  // 'creating', and 'error' are ambiguous (probe in flight, just-pushed,
  // or admin port unreachable), and excluding them would make the export
  // unstable depending on probe timing.
  const projectMocks = mocks.value.filter(m =>
    m.projectId === projectId.value
    && stubStatuses.value[m.id] !== 'missing',
  )
  if (projectMocks.length === 0) {
    showToastMessage(
      missingStubCount.value > 0
        ? 'No mocks with stubs to export — click "click to create" on each card first'
        : 'No mocks in this project to export',
      BaseToastEnum.ERROR,
    )
    return
  }
  const collectionName = project.value?.name ?? 'WireMate Project'
  const collection = buildPostmanCollection(projectMocks, collectionName, WIREMOCK_BASE_URL)
  const safe = (project.value?.name ?? 'project').replace(/[^a-zA-Z0-9_-]/g, '_') || 'project'
  triggerDownload(`${safe}.postman_collection.json`, collection)
  if (missingStubCount.value > 0) {
    showToastMessage(
      `Exported ${projectMocks.length} mock${projectMocks.length === 1 ? '' : 's'} — ${missingStubCount.value} skipped (no stub on WireMock)`,
      BaseToastEnum.SUCCESS,
    )
  }
}
</script>

<template>
  <div>
    <div class="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <!-- Back button -->
      <button
        class="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
        :class="isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'"
        @click="goBack"
      >
        <ArrowLeftIcon class="w-4 h-4" />
        Back to Projects
      </button>

      <!-- Loading -->
      <div v-if="loading" class="flex justify-center py-20">
        <BaseSpinner size="lg" color="emerald" />
      </div>

      <!-- Error -->
      <div v-else-if="error" class="text-center py-20">
        <p class="text-red-500 mb-4">{{ error }}</p>
        <BaseButton
          description="Back to Projects"
          :color="BaseButtonEnum.GREEN"
          @click="goBack"
        />
      </div>

      <!-- Project details -->
      <div v-else-if="project">
        <!-- Project info card -->
        <div class="rounded-lg border p-6 transition-colors"
          :class="isDark
            ? 'bg-gray-900 border-gray-700'
            : 'bg-white border-gray-200'">
          <div class="flex items-center gap-4 mb-6">
            <div class="w-12 h-12 rounded-lg flex items-center justify-center"
              :class="isDark ? 'bg-emerald-500/10' : 'bg-emerald-50'">
              <FolderIcon class="w-6 h-6" :class="t.emeraldText" />
            </div>
            <div class="flex-1 min-w-0">
              <!-- Inline-editable project name. Display mode shows the heading
                   with a pencil icon next to it; edit mode swaps in an input
                   with check / X actions. Enter saves, Esc cancels. -->
              <div v-if="!isEditingProjectName" class="flex items-center gap-2">
                <h2 class="text-xl font-semibold truncate" :class="t.primaryTextSoft">{{ project.name }}</h2>
                <button
                  type="button"
                  @click="startEditProjectName"
                  class="p-1 rounded transition-colors cursor-pointer"
                  :class="isDark ? 'text-gray-500 hover:text-emerald-300 hover:bg-emerald-500/10' : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50'"
                  title="Rename project"
                  aria-label="Rename project"
                >
                  <PencilSquareIcon class="w-4 h-4" />
                </button>
              </div>
              <div v-else class="flex items-center gap-2">
                <input
                  ref="projectNameInput"
                  v-model="projectNameDraft"
                  type="text"
                  :disabled="renamingProject"
                  class="flex-1 min-w-0 rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 transition-colors"
                  :class="isDark
                    ? 'bg-gray-800 border-gray-600 text-gray-100 focus:ring-emerald-500/40 focus:border-emerald-500'
                    : 'bg-white border-gray-300 text-gray-900 focus:ring-emerald-500/40 focus:border-emerald-500'"
                  @keyup.enter="requestSaveProjectName"
                  @keyup.esc="cancelEditProjectName"
                />
                <button
                  type="button"
                  @click="requestSaveProjectName"
                  :disabled="renamingProject || !projectNameDraft.trim()"
                  class="p-1.5 rounded transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  :class="isDark ? 'text-emerald-300 hover:bg-emerald-500/10' : 'text-emerald-600 hover:bg-emerald-50'"
                  title="Save"
                  aria-label="Save project name"
                >
                  <CheckIcon class="w-4 h-4" />
                </button>
                <button
                  type="button"
                  @click="cancelEditProjectName"
                  :disabled="renamingProject"
                  class="p-1.5 rounded transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  :class="isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'"
                  title="Cancel"
                  aria-label="Cancel rename"
                >
                  <XMarkIcon class="w-4 h-4" />
                </button>
              </div>
              <p v-if="renameError" class="text-xs mt-1 text-red-500">{{ renameError }}</p>
              <div class="flex items-center gap-1.5">
                <p class="text-sm" :class="t.dimText">ID: {{ project.id }}</p>
                <BaseCopyButton
                  v-if="project"
                  :text="project.id"
                  label="project ID"
                  @copied="showToastMessage('Project ID copied to clipboard', BaseToastEnum.SUCCESS)"
                  @error="showToastMessage('Failed to copy project ID', BaseToastEnum.ERROR)"
                />
              </div>
            </div>
          </div>

          <div class="border-t pt-4" :class="isDark ? 'border-gray-700' : 'border-gray-100'">
            <div>
              <p class="text-xs uppercase tracking-wide mb-1" :class="t.dimText">Created</p>
              <p class="text-sm" :class="t.label">{{ formatDate(project.createdAt) }}</p>
            </div>
          </div>
        </div>

        <!-- Mocks section -->
        <div class="mt-8">
          <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 class="text-lg font-semibold" :class="t.primaryTextSoft">
              Mocks
              <span v-if="!loading && mocks.length" class="ml-2 text-sm font-normal"
                :class="t.dimText">({{ mocks.length }})</span>
            </h2>
            <div class="flex flex-wrap items-center gap-2">
              <button
                v-if="mocks.length > 0"
                class="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors cursor-pointer border"
                :class="isDark
                  ? 'text-sky-400 border-sky-500/40 hover:bg-sky-500/10'
                  : 'text-sky-700 border-sky-300 hover:bg-sky-50'"
                @click="exportAllMocksAsPostman"
                :title="missingStubCount > 0
                  ? `Download a Postman collection — ${missingStubCount} mock${missingStubCount === 1 ? '' : 's'} without a stub on WireMock will be excluded`
                  : 'Download a Postman collection you can run against the mocks to test them'"
              >
                <ArrowDownTrayIcon class="w-4 h-4" />
                Test in Postman
                <!--
                  Missing-stub count badge. A mock without a stub on
                  WireMock would just answer 404 if hit by Postman, so we
                  drop those from the export — surface the count here so
                  the user understands why the exported collection has
                  fewer requests than the list shown on screen.
                -->
                <span
                  v-if="missingStubCount > 0"
                  class="inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none"
                  :class="isDark
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'bg-amber-100 text-amber-700'"
                  :title="`${missingStubCount} mock${missingStubCount === 1 ? '' : 's'} without a stub will be skipped`"
                >
                  {{ missingStubCount }} skipped
                </span>
              </button>
              <BaseButton
                :color="BaseButtonEnum.EMERALD"
                :size="BaseButtonSizeEnum.SMALL"
                outline
                iconLeft
                description="Import Stubs From Postman Collection"
                title="Import stubs from a Postman collection"
                @click="openImportPostman"
              >
                <ArrowUpTrayIcon class="w-4 h-4 mr-1.5" />
              </BaseButton>
              <button
                class="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors cursor-pointer"
                :class="isDark ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-emerald-600 hover:bg-emerald-700'"
                @click="openCreateMock"
              >
                <PlusIcon class="w-4 h-4" />
                Create Mock
              </button>
            </div>
          </div>

          <!-- Search + filters -->
          <div v-if="mocks.length > 0" class="mb-4 space-y-2">
            <!-- Search row -->
            <div class="flex items-center gap-2">
              <div class="flex-1 flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors"
                :class="isDark ? 'bg-gray-900 border-gray-500' : 'bg-white border-gray-400'">
                <MagnifyingGlassIcon class="w-4 h-4" :class="t.dimText" />
                <input
                  v-model="searchQuery"
                  type="text"
                  placeholder="Filter by name or URL..."
                  class="flex-1 bg-transparent outline-none text-sm placeholder-gray-500"
                  :class="isDark ? 'text-gray-100 placeholder-gray-600' : 'text-gray-900 placeholder-gray-400'"
                />
                <Transition
                  enter-active-class="transition-opacity duration-150 ease-out"
                  leave-active-class="transition-opacity duration-100 ease-in"
                  enter-from-class="opacity-0"
                  enter-to-class="opacity-100"
                  leave-from-class="opacity-100"
                  leave-to-class="opacity-0"
                >
                  <button v-if="searchQuery" type="button" @click="searchQuery = ''"
                    class="cursor-pointer transition-colors" :class="isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'"
                    title="Clear search">
                    <XMarkIcon class="w-4 h-4" />
                  </button>
                </Transition>
              </div>
              <button
                type="button"
                @click="filtersOpen = !filtersOpen"
                class="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors cursor-pointer"
                :class="filtersOpen
                  ? (isDark ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' : 'bg-emerald-50 text-emerald-700 border-emerald-200')
                  : (isDark ? 'bg-gray-900 text-gray-300 border-gray-700 hover:bg-gray-800' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50')"
                :title="filtersOpen ? 'Hide filters' : 'Show filters'"
              >
                <AdjustmentsHorizontalIcon class="w-4 h-4" />
                Filters
                <Transition
                  enter-active-class="transition-all duration-200 ease-out"
                  leave-active-class="transition-all duration-150 ease-in"
                  enter-from-class="opacity-0 scale-75"
                  enter-to-class="opacity-100 scale-100"
                  leave-from-class="opacity-100 scale-100"
                  leave-to-class="opacity-0 scale-75"
                >
                  <span v-if="activeFilterCount > 0" class="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-semibold"
                    :class="isDark ? 'bg-emerald-500 text-emerald-950' : 'bg-emerald-600 text-white'">
                    {{ activeFilterCount }}
                  </span>
                </Transition>
              </button>
              <!-- Clear-all button fades in/out instead of popping -->
              <Transition
                enter-active-class="transition-all duration-200 ease-out"
                leave-active-class="transition-all duration-150 ease-in"
                enter-from-class="opacity-0 -translate-x-1"
                enter-to-class="opacity-100 translate-x-0"
                leave-from-class="opacity-100 translate-x-0"
                leave-to-class="opacity-0 -translate-x-1"
              >
                <button
                  v-if="activeFilterCount > 0"
                  type="button"
                  @click="clearAllFilters"
                  class="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors cursor-pointer"
                  :class="isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'"
                  title="Clear every active filter"
                >
                  <XMarkIcon class="w-3.5 h-3.5" />
                  Clear all
                </button>
              </Transition>
            </div>

            <!--
              Filters panel (collapsible).
              Uses the `grid-rows: 0fr ↔ 1fr` trick so the panel expands to
              its natural content height rather than an arbitrary max-height
              — and a single transition animates height + opacity together
              for a smooth open/close. The inner wrapper needs
              `overflow-hidden` so the content is clipped while the row
              tween is in progress.
            -->
            <div
              class="grid transition-all duration-300 ease-out"
              :class="filtersOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'"
              :aria-hidden="!filtersOpen"
            >
              <div class="min-h-0" :class="filtersOverflowReleased ? '' : 'overflow-hidden'">
            <div class="rounded-lg border p-4 transition-colors"
              :class="t.cardAlt">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Method -->
                <div>
                  <label class="block text-xs font-semibold uppercase tracking-wide mb-1"
                    :class="t.dimTextAlt">HTTP Method</label>
                  <BaseDropdown v-model="methodFilter" :options="METHOD_FILTER_OPTIONS"
                    size="sm" aria-label="HTTP method filter" />
                </div>
                <!-- Status -->
                <div>
                  <label class="block text-xs font-semibold uppercase tracking-wide mb-1"
                    :class="t.dimTextAlt">Response Status</label>
                  <BaseDropdown v-model="statusBucketFilter" :options="STATUS_BUCKET_OPTIONS"
                    size="sm" aria-label="Response status filter" />
                </div>
              </div>
              <!-- Feature toggles -->
              <div class="mt-4">
                <label class="block text-xs font-semibold uppercase tracking-wide mb-2"
                  :class="t.dimTextAlt">
                  Features
                  <span class="ml-1 font-normal normal-case tracking-normal"
                    :class="t.dimText">
                    (click to cycle Any → Yes → No)
                  </span>
                </label>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="f in FEATURE_FILTERS"
                    :key="f.label"
                    type="button"
                    @click="cycleTriState(f.ref)"
                    class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer"
                    :class="f.ref.value === 'yes'
                      ? (isDark ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' : 'bg-emerald-50 text-emerald-700 border-emerald-300')
                      : f.ref.value === 'no'
                        ? (isDark ? 'bg-red-500/15 text-red-300 border-red-500/40' : 'bg-red-50 text-red-700 border-red-300')
                        : (isDark ? 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100')"
                  >
                    <span>{{ f.label }}</span>
                    <span class="text-[10px] uppercase tracking-wide opacity-70">
                      {{ f.ref.value === 'any' ? '—' : f.ref.value === 'yes' ? 'yes' : 'no' }}
                    </span>
                  </button>
                </div>
              </div>
            </div>
              </div>
            </div>
          </div>

          <!-- Empty state — project has no mocks yet -->
          <div v-if="mocks.length === 0" class="flex flex-col items-center justify-center text-center py-16 rounded-lg border transition-colors"
            :class="isDark ? 'bg-gray-900/50 border-gray-800' : 'bg-gray-50 border-gray-200'">
            <InboxIcon class="w-12 h-12 mb-3" :class="t.illustration" />
            <p class="text-sm font-medium" :class="isDark ? 'text-gray-300' : 'text-gray-600'">
              No mocks yet
            </p>
            <p class="text-xs mt-1" :class="t.dimText">
              Create your first mock to get started.
            </p>
          </div>

          <!-- Empty state — search/filter returned no matches -->
          <div
            v-else-if="filteredMocks.length === 0"
            class="flex flex-col items-center justify-center text-center py-16 rounded-lg border transition-colors"
            :class="isDark ? 'bg-gray-900/50 border-gray-800' : 'bg-gray-50 border-gray-200'"
          >
            <FaceFrownIcon class="w-12 h-12 mb-3" :class="t.illustration" />
            <p class="text-sm font-medium" :class="isDark ? 'text-gray-300' : 'text-gray-600'">
              <template v-if="searchQuery && activeFilterCount === 1">No mocks match “{{ searchQuery }}”</template>
              <template v-else>No mocks match the current filters</template>
            </p>
            <p class="text-xs mt-1" :class="t.dimText">
              Try adjusting your search or
              <button type="button" @click="clearAllFilters"
                class="underline underline-offset-2 cursor-pointer"
                :class="isDark ? 'text-emerald-400 hover:text-emerald-300' : 'text-emerald-600 hover:text-emerald-700'">
                clear {{ activeFilterCount > 1 ? 'all filters' : 'the search' }}
              </button>.
            </p>
          </div>

          <!-- Mocks list -->
          <!--
            Mocks that share a URL are rendered as a single cluster inside a
            dashed amber frame with a collapsible header. The header carries
            the shared URL, the count, and a chevron that toggles the
            cluster open/closed — handy when a URL has many competing
            mocks and the user wants to focus on one section at a time.

            Within each cluster, mocks are ordered by `priority` ascending
            (WireMock picks the lowest — the top card is the one that
            actually matches). Isolated mocks (URL appears once) render
            exactly as before: the wrapper uses `display: contents` so it
            vanishes from layout and the single card becomes a direct grid
            child, with no frame or header chrome around it.
          -->
          <div v-if="mocks.length > 0 && filteredMocks.length > 0" class="grid grid-cols-1 gap-4">
            <div
              v-for="group in groupedFilteredMocks"
              :key="group.url"
              :class="group.inGroup
                ? (isDark
                    ? 'rounded-xl border-2 border-dashed border-amber-500/40 bg-amber-500/[0.03] overflow-hidden'
                    : 'rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/40 overflow-hidden')
                : 'contents'"
            >
              <!-- Group header — clickable toggle, only for URLs with 2+ mocks -->
              <button v-if="group.inGroup" type="button"
                @click="toggleGroupCollapse(group.url)"
                class="w-full flex items-center flex-wrap gap-2 px-3 py-2 text-left transition-colors cursor-pointer"
                :class="isDark ? 'hover:bg-amber-500/[0.06]' : 'hover:bg-amber-100/50'"
                :aria-expanded="!isGroupCollapsed(group.url)"
                :title="isGroupCollapsed(group.url) ? 'Expand group' : 'Collapse group'">
                <ChevronDownIcon class="w-4 h-4 shrink-0 transition-transform"
                  :class="[
                    t.amberTextStrong,
                    isGroupCollapsed(group.url) ? '-rotate-90' : ''
                  ]" />
                <DocumentDuplicateIcon class="w-4 h-4 shrink-0"
                  :class="t.amberTextStrong" />
                <span class="text-xs font-semibold"
                  :class="isDark ? 'text-amber-200' : 'text-amber-800'">
                  Shared URL
                </span>
                <code class="text-xs font-mono px-1.5 py-0.5 rounded max-w-[24rem] truncate border"
                  :class="isDark
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                    : 'bg-white border-amber-200 text-amber-900'"
                  :title="group.url">
                  {{ group.url }}
                </code>
                <span class="text-[11px]"
                  :class="isDark ? 'text-amber-300/80' : 'text-amber-700'">
                  · {{ group.mocks.length }} mocks, ordered by priority (lowest matches first)
                </span>
              </button>

              <!--
                Cards container:
                  - For multi-mock groups: a padded, bordered block that
                    stacks cards vertically. `v-show` toggles visibility
                    via the header chevron, preserving scroll and form
                    state on collapse.
                  - For single-mock groups: `display: contents` so the
                    card becomes a direct grid child of the outer grid,
                    keeping spacing identical to the un-grouped case.
              -->
              <div
                v-show="!(group.inGroup && isGroupCollapsed(group.url))"
                :class="group.inGroup
                  ? ['p-3 space-y-3 border-t', isDark ? 'border-amber-500/30' : 'border-amber-200']
                  : 'contents'"
              >
              <div
                v-for="mock in group.mocks"
                :key="mock.id"
                class="rounded-xl border p-4 flex flex-col justify-between transition-all"
                :class="isDark
                  ? 'bg-gray-900 border-gray-700 hover:bg-gray-950'
                  : 'bg-white border-gray-200 shadow-sm hover:bg-gray-100'"
            >
              <!-- Top: method + url badge + prominent features + meta -->
              <div>
                <!--
                  Row 1 — the "identity" row.
                    Method chip + status chip + URL badge (monospace, truncated),
                    followed by URL match type, priority, persistence, and any
                    prominent features (auth, fault). The URL lives here rather
                    than on its own line below the name so the request shape
                    is readable at a glance, the way developers parse API docs.
                -->
                <div class="flex items-center flex-wrap gap-2 mb-2">
                  <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide"
                    :class="methodColor(mock.request.method)"
                    :title="`HTTP method: ${mock.request.method}`">
                    {{ mock.request.method }}
                  </span>
                  <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
                    :class="statusBadgeClasses(mock.response.status)"
                    :title="`HTTP ${mock.response.status}${mock.response.statusMessage ? ' · ' + mock.response.statusMessage : ''}`">
                    {{ mock.response.status }}
                  </span>
                  <!--
                    Content-Type chip — surfaces the stub's advertised
                    response MIME type at the top of the card so the
                    payload's shape is obvious without opening the mock.
                    Rendered only when the stub actually sets one; we
                    don't want to invent a default on a card that may
                    legitimately return an empty body (e.g. 204).
                  -->
                  <span v-if="responseContentType(mock)"
                    class="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono max-w-[16rem] truncate border"
                    :class="isDark ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border-emerald-200'"
                    :title="`Response Content-Type: ${responseContentType(mock)}`">
                    {{ responseContentType(mock) }}
                  </span>
                  <!--
                    URL badge — monospaced and capped with `max-w-[24rem]
                    truncate` so a long path doesn't wrap the chip row. Full
                    URL is preserved in the tooltip. Coloured indigo so the
                    request path reads as a primary identifier instead of
                    blending into the neutral chrome around it.
                  -->
                  <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono max-w-[24rem] truncate border"
                    :class="isDark ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30' : 'bg-indigo-50 text-indigo-700 border-indigo-200'"
                    :title="getMockUrl(mock)">
                    {{ getMockUrl(mock) }}
                  </span>
                  <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide border"
                    :class="isDark ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500'"
                    :title="`URL match type: ${urlMatchLabel(mock)}`">
                    {{ urlMatchLabel(mock) }}
                  </span>
                  <span v-if="typeof mock.priority === 'number'"
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border"
                    :class="priorityBadgeClasses(mock.priority)"
                    :title="`Priority ${mock.priority} (lower = higher precedence)`">
                    <FlagIcon class="w-3 h-3" />
                    P{{ mock.priority }}
                  </span>
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium"
                    :class="mock.persistent
                      ? (isDark ? 'bg-emerald-500/10 text-emerald-300' : 'bg-emerald-50 text-emerald-700')
                      : (isDark ? 'bg-red-500/10 text-red-300' : 'bg-red-50 text-red-700')"
                    :title="mock.persistent ? 'Survives WireMock resets' : 'Cleared on WireMock reset'">
                    <BookmarkIcon class="w-3 h-3" />
                    {{ mock.persistent ? 'Persistent' : 'Ephemeral' }}
                  </span>
                  <!--
                    Prominent feature chips (auth, fault) live in the top
                    row so security-relevant behaviours are front-and-centre
                    instead of lost in the chip grid below.
                  -->
                  <span v-for="chip in prominentChips(mock)" :key="chip.key"
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium"
                    :class="isDark ? chip.darkClasses : chip.lightClasses"
                    :title="chip.title">
                    <component :is="chip.icon" class="w-3 h-3" />
                    {{ chip.label }}
                  </span>

                </div>

                <!-- Row 2 — mock name (primary heading) -->
                <div class="flex items-center gap-2">
                  <CodeBracketIcon class="w-5 h-5 shrink-0" :class="t.emeraldText" />
                  <h3 class="text-sm font-semibold truncate" :class="t.primaryTextSoft">
                    {{ mock.name }}
                  </h3>
                </div>

                <!--
                  Row 3 — optional description. Only renders when present
                  so the card doesn't grow a blank line for unconfigured
                  mocks. `line-clamp-2` caps it to two lines so long blurbs
                  don't stretch the card.
                -->
                <p v-if="mock.description && mock.description.trim()"
                  class="text-xs mt-1.5 line-clamp-2"
                  :class="t.mutedText"
                  :title="mock.description">
                  {{ mock.description }}
                </p>

                <!--
                  Row 4 — scenario walkthrough. Surfaces the required→new
                  state transition inline so users can see the flow without
                  opening the edit form.
                -->
                <!--
                  Row 5 — Request / Response summary.
                  Two side-by-side boxes that capture the shape of the
                  matcher (left) and the canned response (right) without
                  the user having to open the edit form. Each box renders
                  a tight key/value grid driven by `requestSummary` /
                  `responseSummary`; entries with no meaningful data are
                  filtered out so empty mocks don't pad the card with
                  zero-count rows.
                -->
                <div class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div class="rounded-lg border p-2.5"
                    :class="isDark ? 'border-sky-500/30 bg-sky-500/5' : 'border-sky-200 bg-sky-50/60'">
                    <div class="flex items-center gap-1.5 mb-1.5">
                      <ArrowDownTrayIcon class="w-3.5 h-3.5"
                        :class="isDark ? 'text-sky-300' : 'text-sky-700'" />
                      <h4 class="text-[10px] font-semibold uppercase tracking-wide"
                        :class="isDark ? 'text-sky-300' : 'text-sky-700'">
                        Request Matching
                      </h4>
                    </div>
                    <dl class="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
                      <template v-for="row in requestSummary(mock)" :key="row.label">
                        <dt class="font-medium" :class="t.dimTextAlt">
                          {{ row.label }}
                        </dt>
                        <dd class="font-mono truncate" :class="isDark ? 'text-gray-200' : 'text-gray-800'"
                          :title="row.value">
                          {{ row.value }}
                        </dd>
                      </template>
                    </dl>
                  </div>
                  <div class="rounded-lg border p-2.5"
                    :class="isDark ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-emerald-200 bg-emerald-50/60'">
                    <div class="flex items-center gap-1.5 mb-1.5">
                      <ArrowUpTrayIcon class="w-3.5 h-3.5"
                        :class="isDark ? 'text-emerald-300' : 'text-emerald-700'" />
                      <h4 class="text-[10px] font-semibold uppercase tracking-wide"
                        :class="isDark ? 'text-emerald-300' : 'text-emerald-700'">
                        Response Definition
                      </h4>
                    </div>
                    <dl class="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
                      <template v-for="row in responseSummary(mock)" :key="row.label">
                        <dt class="font-medium" :class="t.dimTextAlt">
                          {{ row.label }}
                        </dt>
                        <dd class="font-mono truncate" :class="isDark ? 'text-gray-200' : 'text-gray-800'"
                          :title="row.value">
                          {{ row.value }}
                        </dd>
                      </template>
                    </dl>
                  </div>
                </div>

              </div>

              <!-- Bottom: actions -->
              <div class="flex items-center gap-2 mt-3 pt-3 border-t"
                :class="t.divider">
                <BaseActionButton
                  full-width
                  label="Edit"
                  color="emerald"
                  title="Edit this mock's request matcher and response definition"
                  @click="editMock(mock)"
                >
                  <template #icon="{ iconClass }">
                    <PencilSquareIcon :class="iconClass" />
                  </template>
                </BaseActionButton>
                <BaseActionButton
                  full-width
                  label="Logs"
                  color="sky"
                  title="View request logs for this mock"
                  @click="viewMockLogs(mock)"
                >
                  <template #icon="{ iconClass }">
                    <ClipboardDocumentListIcon :class="iconClass" />
                  </template>
                </BaseActionButton>
                <!--
                  Stub slot.
                    • When the matching stub is missing from WireMock we
                      swap this action out for a "click to create" call,
                      so the same slot that usually opens the raw stub
                      becomes the one-click way to re-push it. On
                      success the stub status flips to `exists` and the
                      slot reverts to the normal navigation button.
                    • 'creating' → show a dimmed spinner in the same
                      slot so the user gets immediate in-flight
                      feedback without the button visually jumping.
                    • Any other state ('exists', 'loading', 'error',
                      unknown) → the regular Stub button that routes
                      to /stubs/:id — we don't want to mislabel it as
                      missing just because we haven't finished probing
                      WireMock yet.
                -->
                <BaseActionButton
                  v-if="stubStatuses[mock.id] === 'missing'"
                  full-width
                  label="click to create"
                  color="amberStrong"
                  title="No matching stub on WireMock — click to create it from this mock"
                  @click="createStubForMock(mock)"
                />
                <button
                  v-else-if="stubStatuses[mock.id] === 'creating'"
                  disabled
                  class="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-not-allowed opacity-70"
                  :class="t.amberTextStrong"
                  title="Creating stub on WireMock…"
                >
                  <ArrowPathIcon class="w-4 h-4 animate-spin text-emerald-500" />
                  Creating…
                </button>
                <!--
                  'loading' → the per-mock WireMock stub-existence probe
                  (HTTP) is still in flight. Show a disabled spinner in
                  the Stub slot so the user can see a request is running
                  rather than a static, already-resolved button.
                -->
                <BaseActionButton
                  v-else-if="stubStatuses[mock.id] === 'loading'"
                  full-width
                  disabled
                  label="Stub"
                  color="indigo"
                  title="Checking whether a matching stub exists on WireMock…"
                >
                  <template #icon="{ iconClass }">
                    <ArrowPathIcon :class="[iconClass, 'animate-spin', 'text-emerald-500']" />
                  </template>
                </BaseActionButton>
                <BaseActionButton
                  v-else
                  full-width
                  label="Stub"
                  color="indigo"
                  title="Open the raw WireMock stub"
                  @click="viewMockStub(mock)"
                >
                  <template #icon="{ iconClass }">
                    <CubeIcon :class="iconClass" />
                  </template>
                </BaseActionButton>
                <!--
                  Copy cURL — surfaces the backend-persisted `curl`
                  string. Disabled and visibly dimmed when the mock has
                  no curl (e.g. pattern-based URLs where a runnable
                  cURL can't be generated), so users understand the
                  affordance is conditional rather than broken.
                -->
                <BaseActionButton
                  full-width
                  label="cURL"
                  color="teal"
                  :disabled="!mock.curl"
                  :title="mock.curl ? 'Copy cURL to clipboard' : 'No cURL available for this mock'"
                  @click="copyCurlFromMock(mock)"
                >
                  <template #icon="{ iconClass }">
                    <CommandLineIcon :class="iconClass" />
                  </template>
                </BaseActionButton>
                <BaseActionButton
                  full-width
                  label="Clone"
                  color="amber"
                  title="Clone this mock into this or another project"
                  @click="handleCloneMock(mock)"
                >
                  <template #icon="{ iconClass }">
                    <DocumentDuplicateIcon :class="iconClass" />
                  </template>
                </BaseActionButton>
                <button
                  type="button"
                  :disabled="projectsCountLoading || !hasOtherProjects"
                  :title="projectsCountLoading
                    ? 'Checking for other projects to move to…'
                    : hasOtherProjects ? 'Move this mock to another project' : 'No other projects exist — create another project first to enable Move.'"
                  :aria-label="projectsCountLoading
                    ? 'Move: checking for other projects'
                    : hasOtherProjects ? `Move mock '${mock.name}'` : `Move disabled: no other projects exist`"
                  @click="handleMoveMock(mock)"
                  class="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  :class="projectsCountLoading
                    ? (isDark
                        ? 'text-purple-400 cursor-wait opacity-70'
                        : 'text-purple-600 cursor-wait opacity-70')
                    : !hasOtherProjects
                      ? (isDark
                          ? 'text-gray-500 cursor-not-allowed opacity-60'
                          : 'text-gray-400 cursor-not-allowed opacity-60')
                      : (isDark
                          ? 'text-purple-400 hover:bg-purple-500/10 cursor-pointer'
                          : 'text-purple-600 hover:bg-purple-50 cursor-pointer')"
                >
                  <ArrowPathIcon v-if="projectsCountLoading" class="w-4 h-4 animate-spin text-emerald-500" aria-hidden="true" />
                  <ArrowRightStartOnRectangleIcon v-else class="w-4 h-4" aria-hidden="true" />
                  Move
                </button>
                <BaseActionButton
                  full-width
                  label="Export"
                  color="sky"
                  title="Export as Postman collection"
                  @click="exportMockAsPostman(mock)"
                >
                  <template #icon="{ iconClass }">
                    <ArrowDownTrayIcon :class="iconClass" />
                  </template>
                </BaseActionButton>
                <BaseActionButton
                  full-width
                  label="Delete"
                  color="red"
                  title="Permanently delete this mock and its WireMock stub"
                  @click="handleDeleteMock(mock)"
                >
                  <template #icon="{ iconClass }">
                    <TrashIcon :class="iconClass" />
                  </template>
                </BaseActionButton>
              </div>
            </div>
              </div><!-- /cards container -->
            </div><!-- /group container -->
          </div><!-- /outer grid -->
        </div>
      </div>
    </div>

    <!--
      Project rename confirmation modal. Mock URLs on the backend are
      namespaced under the project name, so renaming the project
      rewrites the first path segment of every mock's URL. Warn the
      user explicitly before the PUT — once the backend rewrites the
      paths there's no automatic rollback.
    -->
    <BaseConfirmModal
      v-if="showRenameConfirmModal"
      title="Rename Project?"
      :message="`Renaming '${project?.name}' to '${pendingProjectName}' will update the first path segment of every mock URL in this project${mocks.length ? ` (${mocks.length} mock${mocks.length === 1 ? '' : 's'} affected)` : ''}. The change applies to both the database and the WireMock service. Continue?`"
      confirm-text="Yes, rename"
      cancel-text="Cancel"
      submitting-text="Renaming..."
      variant="warning"
      :submitting="renamingProject"
      @confirm="saveProjectName"
      @cancel="cancelRenameConfirm"
    >
      <!-- Bold the old/new project names so the user can see exactly what's
           changing at a glance. Mirrors the plain-string `:message` above. -->
      <template #message>
        <p class="text-sm" :class="isDark ? 'text-gray-300' : 'text-gray-600'">
          Renaming <strong :class="t.primaryTextSoft">'{{ project?.name }}'</strong>
          to <strong :class="t.primaryTextSoft">'{{ pendingProjectName }}'</strong>
          will update the first path segment of every mock URL in this project<template v-if="mocks.length"> ({{ mocks.length }} mock{{ mocks.length === 1 ? '' : 's' }} affected)</template>.
          The change applies to both the database and the WireMock service. Continue?
        </p>
      </template>
    </BaseConfirmModal>

    <!-- Delete confirmation modal -->
    <BaseConfirmModal
      v-if="showDeleteModal"
      title="Delete Mock"
      :message="`Are you sure you want to delete mock '${mockToDelete?.name}'? The mock will be removed from both the database and the WireMock service. This action cannot be undone.`"
      confirm-text="Yes, delete"
      cancel-text="Cancel"
      submitting-text="Deleting..."
      variant="danger"
      :submitting="isDeletingMock"
      @confirm="confirmDeleteMock"
      @cancel="cancelDeleteMock"
    />

    <!-- Clone mock modal -->
    <BaseTextInputModal
      v-if="showCloneMockModal"
      title="Clone Mock"
      :message="`Create a copy of '${mockToClone?.name}'.`"
      :initial-value="cloneSuggestedName"
      placeholder="Enter mock name..."
      confirm-text="Clone"
      :submitting="cloneMockSubmitting"
      @confirm="confirmCloneMock"
      @cancel="cancelCloneMock"
    />

    <!-- Move mock modal -->
    <MoveModal
      v-if="showMoveModal && mockToMove"
      ref="moveModalRef"
      title="Move Mock"
      :message="`Pick the project to move '${mockToMove.name}' to.`"
      :current-project-id="projectId"
      @confirm="confirmMoveMock"
      @cancel="cancelMoveMock"
    />

    <!-- Postman import modal -->
    <ImportPostmanModal
      v-if="showImportPostmanModal"
      :project-id="projectId"
      @imported="onPostmanImported"
      @cancel="onPostmanCancel"
    />

    <BaseToast
      v-if="showToast"
      :mode="toastType"
      :description="toastMessage"
    />
  </div>
</template>
