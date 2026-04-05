<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { AlertEnum, BaseAlert, BaseButton, BaseButtonEnum, BaseChipButton, BaseCollapsibleSection, BaseCopyButton, BaseDateTimePicker, BaseDropdown, BaseRemoveButton, BaseSpinner, BaseToast, BaseToastEnum, fmtBytes, fmtMsAsSeconds, isValidBase64, isValidJson, isValidXml, rowKeyMissing, rowValueMissing, useDebouncedRef, useFieldClasses, useTheme, useThemeClasses, useToast, type DropdownOption } from 'mgv-backoffice'
import { mockApi } from '../services/api'
import type { KeyValuePair, MockResponse, CreateMockPayload, RequestDefinition, ResponseDefinition, BodyPattern, StringMatcher, WebhookDefinition } from '../types/mock'
import { WIREMOCK_BASE_URL } from '../config'
import { checkStubExists } from '../services/stubService'
import { fetchProject } from '../services/projectService'
import { checkMockUrlExists, checkMockNameExists } from '../services/mockService'
import BasicAuthSection from './mock-form/BasicAuthSection.vue'
import FaultSimulationSection from './mock-form/FaultSimulationSection.vue'
import ChunkedDribbleSection from './mock-form/ChunkedDribbleSection.vue'
import WebhooksSection from './mock-form/WebhooksSection.vue'
import ProxyingSection from './mock-form/ProxyingSection.vue'
import {
  type CookieRow,
  COOKIE_ATTRS_METADATA_KEY,
  createCookieRow,
  cookieStr,
  isValidCookieDomain,
  isValidCookiePath,
  cookieToSetCookieString,
  parseSetCookieString,
} from '../utils/cookies'
import {
  type ValidationIssue,
  validateBasicAuth,
  validateChunkedDribble,
  validateCookieAttributes,
  validateProxyUrl,
  validateUniformDelay,
  validateWebhookUrl,
} from '../composables/useMockValidation'

const { isDark } = useTheme()

const t = useThemeClasses()
const props = defineProps<{
  projectId?: string
  mock?: MockResponse
}>()

const emit = defineEmits<{
  created: [mockId: string]
  updated: [mockId: string]
}>()

const isEditMode = computed(() => !!props.mock)

// ── Matcher row type ──────────────────────────────────────────
interface MatcherRow {
  key: string
  matcherType: string
  value: string
  // When true, the comparison is case-insensitive. WireMock honours this
  // on `equalTo`, `contains`, `matches`, and `doesNotMatch` — for other
  // matcher kinds (absent, date-based) the field is ignored.
  caseInsensitive: boolean
}

interface BodyPatternRow {
  matcherType: string
  value: string
  ignoreArrayOrder: boolean
  ignoreExtraElements: boolean
  // Optional advanced fields, only meaningful for specific matcher types:
  //   • matchesJsonPath          → varyBy (sub-expression for templating)
  //                              → jsonPathSubMatcher / jsonPathSubMatcherValue
  //                                 (sub-matcher applied to the value the
  //                                  JSONPath expression extracted)
  //   • matchesXPath             → xPathNamespaces (prefix → URI map)
  //   • equalToXml               → enablePlaceholders, xPathNamespaces
  //   • matchesJsonSchema        → schemaVersion (e.g. V202012)
  //   • before/after/equalToDateTime → truncate/offset options
  varyBy?: string
  enablePlaceholders?: boolean
  xPathNamespaces?: Array<{ prefix: string; uri: string }>
  truncateExpected?: string
  truncateActual?: string
  expectedOffset?: number
  expectedOffsetUnit?: string
  schemaVersion?: string
  // JSONPath object-form sub-matcher. Default `''` (or `'none'`) emits the
  // bare-expression form on the wire; any other kind is paired with the
  // expression in `{ matchesJsonPath: { expression, [kind]: value } }`.
  jsonPathSubMatcher?: string
  jsonPathSubMatcherValue?: string
  // Echo of the most recently uploaded file (name + size) for the
  // per-row "Upload file" helper, plus its own read/validation error.
  // Mirrors the Response Body upload state, but kept per-row since body
  // patterns are a list.
  uploadedFileName?: string
  uploadedFileSize?: number
  uploadFileError?: string
  // True while this row's picked file is being read by FileReader.
  uploadFileLoading?: boolean
}

// Sub-matcher kinds WireMock accepts inside the object form of
// `matchesJsonPath`. `absent` doesn't need a value (asserts the JSONPath
// hit is missing); every other kind takes a string.
const JSONPATH_SUB_MATCHERS = [
  { value: '', label: '(none — bare expression)' },
  { value: 'equalTo', label: 'equalTo' },
  { value: 'contains', label: 'contains' },
  { value: 'matches', label: 'matches (regex)' },
  { value: 'doesNotMatch', label: 'doesNotMatch (regex)' },
  { value: 'equalToJson', label: 'equalToJson' },
  { value: 'equalToXml', label: 'equalToXml' },
  { value: 'absent', label: 'absent (no extracted value)' },
] as const

// Matcher kinds that respect `caseInsensitive`. Used to decide whether
// the checkbox should be shown next to a row's matcher dropdown.
const CASE_INSENSITIVE_MATCHERS = new Set([
  'equalTo', 'contains', 'matches', 'doesNotMatch',
])

function supportsCaseInsensitive(matcherType: string): boolean {
  return CASE_INSENSITIVE_MATCHERS.has(matcherType)
}

interface MetadataRow {
  key: string
  value: string
  valueType: 'text' | 'json'
  locked?: boolean
}

// Metadata keys that are auto-managed by WireMate. They are rendered as
// readonly rows (key, value type, AND value), cannot be removed by the
// user, and always get their canonical value regardless of what may
// have been stored on the mock.
//
// `projectId` is the canonical key name (renamed from the legacy
// `project`); legacy mocks that still carry `project` are migrated on
// load — see populateFromMock() below.
const LOCKED_METADATA_KEYS = new Set(['projectId', 'generatedBy'])

// Canonical builder for the system-managed metadata rows. Kept in one
// place so the default form, the edit pre-fill, and the reset handler all
// agree on which keys are locked and what their values are. Both the
// `projectId` and `generatedBy` rows are fully locked: the user cannot
// rename the key, change the value type, or edit the value.
function buildLockedMetadataRows(projectId: string): MetadataRow[] {
  return [
    { key: 'projectId', value: projectId, valueType: 'text', locked: true },
    { key: 'generatedBy', value: 'wiremate', valueType: 'text', locked: true },
  ]
}

interface ProxyHeaderRow {
  key: string
  value: string
}

// ── Collapsible section state ─────────────────────────────────
// `true` = collapsed (header only), `false` = expanded (body shown).
// The three primary sections (general, requestMatching, responseDefinition)
// default to expanded because users almost always want to fill them in;
// every other section is optional and starts collapsed to keep the form
// scannable on first load.
const collapsedSections = ref<Record<string, boolean>>({
  general: false,
  requestMatching: false,
  responseDefinition: false,
  metadata: false,
  cookies: true,
  basicAuth: true,
  faultSimulation: true,
  proxying: true,
  webhooks: true,
  chunkedDribble: true,
})

function toggleSection(section: string) {
  collapsedSections.value[section] = !collapsedSections.value[section]
}

// ── Form state: General ───────────────────────────────────────
const mockName = ref('')
const description = ref('')
const internalProjectId = ref(props.projectId ?? '')
// Display-only project name resolved from `internalProjectId`. Always shown
// alongside the UUID in the General section so the user can confirm at a
// glance which project this mock belongs to. Populated via /api/projects/{id}.
const projectName = ref('')
// URL-friendly slug derived from `projectName`. Used as a forced namespace
// prefix on the request URL — every mock under "Acme Project" lives under
// /acme-project/... so the user never mixes mocks across projects by accident.
function slugifyProjectName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
const projectSlug = computed(() => slugifyProjectName(projectName.value))
// `/{slug}` if we know the slug, otherwise empty so legacy/no-project flows
// behave like the pre-namespacing UI.
const projectUrlPrefix = computed(() => projectSlug.value ? `/${projectSlug.value}` : '')

// Initial-load gate. Stays true until the on-mount project fetch
// resolves (or no fetch is needed because we have no projectId yet)
// so the form doesn't pop in unstyled while the project metadata is
// still being resolved. Toggled to false inside the projectId
// watcher's first run.
const initialLoading = ref(true)

// Fetch project name whenever the resolved project id changes. Runs on every
// entry into the form (create-with-projectId-query-param, edit-mode-after-
// populateFromMock, and the rarely-used create-without-projectId flow once
// the user pastes an id). Failures are swallowed — the UUID stays visible.
watch(
  internalProjectId,
  async (id) => {
    const trimmed = (id ?? '').trim()
    if (!trimmed) {
      projectName.value = ''
      // No project to resolve — clear the loading gate immediately
      // so the form renders on the bare /mocks/create route.
      initialLoading.value = false
      return
    }
    try {
      const proj = await fetchProject(trimmed)
      projectName.value = proj.name ?? ''
    } catch {
      projectName.value = ''
    } finally {
      initialLoading.value = false
    }
  },
  { immediate: true },
)
const persistent = ref(true)
// Priority defaults to 5 to match WireMock's own default (lower = higher
// priority). Pre-populating the field means a brand-new mock is immediately
// valid, and users can still override or clear it before saving.
const priority = ref<number | undefined>(5)

// ── Form state: Metadata ──────────────────────────────────────
const metadataRows = ref<MetadataRow[]>([])

// One-way sync from `internalProjectId` → the (read-only) `projectId`
// metadata row. The metadata row is system-managed and locked, so the
// project-id input on the form (or the route's ?projectId param) is the
// only source of truth; this watcher just keeps the metadata row's
// displayed value in step with it. Compare before assigning to avoid
// triggering deep watchers on metadataRows for no-op updates.
watch(internalProjectId, (id) => {
  const projectRow = metadataRows.value.find(r => r.key === 'projectId')
  if (projectRow && projectRow.value !== id) {
    projectRow.value = id
  }
})

// ── Form state: Request ───────────────────────────────────────
const httpMethod = ref('GET')
const urlMatchType = ref<'url' | 'urlPath' | 'urlPattern' | 'urlPathPattern'>('urlPath')
const urlValue = ref('/')

// Query Parameters section is disabled when the URL Match mode is
// full-URL — `url` (Exact URL) or `urlPattern` (URL Regex). Both modes
// match against the entire request URL *including* the query string, so
// a separate Query Parameter matcher is redundant at best and a bug at
// worst: the exact `url` match fails the moment a real request carries a
// query string, and the query matcher never gets a chance to help.
// Separate query matchers only make sense with the path-only modes
// (`urlPath` / `urlPathPattern`), which ignore the query string and rely
// on the Query Parameters block to assert on it. We disable the controls
// (rather than hiding) so any previously-entered rows stay visible (and
// ignored at submit time, see buildRequest()).
const isQueryParamsDisabled = computed(() =>
  urlMatchType.value === 'url' || urlMatchType.value === 'urlPattern'
)

// Ensure the URL always starts with /
watch(urlValue, (newVal) => {
  if (!newVal.startsWith('/')) {
    urlValue.value = '/' + newVal.replace(/^\/+/, '')
  }
})

// ── URL collision check (live) ────────────────────────────────
// As the user types in the URL field, ping the backend with the current
// project id + the full namespaced URL (project slug prefix + user-typed
// portion — i.e. exactly what would be saved). Debounced 300ms so we
// don't fire a request per keystroke.
//
// Backend contract:
//   GET /api/mocks/projects/{projectId}/exists/by-url?url={url}
//     200 OK true  → a mock at that URL already exists under this
//                    project; surface the warning under the input.
//     200 OK false → no collision; keep the UI silent.
// Failures are swallowed silently — this is a soft, advisory check
// and a transient backend hiccup shouldn't decorate the form with a
// scary error while the user is mid-edit.
const urlExists = ref(false)
const debouncedUrlValue = useDebouncedRef(urlValue, 300)
// Sequence guard for the existence check. Each watcher firing bumps the
// counter and snapshots its own value; when the awaited fetch resolves,
// we only commit the result if our snapshot is still the latest. Without
// this, a slow earlier request can land *after* a fast later one and
// flip `urlExists` to a stale truth — surfacing a warning that doesn't
// match what the user is currently typing.
let urlCheckSeq = 0

watch(
  () => [internalProjectId.value, debouncedUrlValue.value, projectUrlPrefix.value] as const,
  async ([projId, urlQuery, prefix]) => {
    const seq = ++urlCheckSeq
    const trimmedProjId = (projId ?? '').trim()
    const trimmedUrl = (urlQuery ?? '').trim()
    // Skip the probe for empty inputs or the seed `/` placeholder —
    // those are either invalid or the project root and provide no
    // actionable signal.
    if (!trimmedProjId || !trimmedUrl || trimmedUrl === '/') {
      urlExists.value = false
      return
    }
    // Send the same fully-qualified URL the form will actually persist:
    // project namespace prefix + user-typed path. Anything else risks
    // false negatives (collision exists in storage but probe misses it
    // because the prefix wasn't applied).
    const path = trimmedUrl.startsWith('/') ? trimmedUrl : `/${trimmedUrl}`
    const fullUrl = (prefix || '') + path
    try {
      const exists = await checkMockUrlExists(trimmedProjId, fullUrl)
      if (seq !== urlCheckSeq) return // stale — a newer call is in flight
      // In edit mode, the URL the user is editing belongs to the mock
      // they're already editing — don't warn them about themselves.
      let shouldWarn = exists
      if (exists && isEditMode.value && props.mock) {
        const ownUrl = props.mock.request.url
          || props.mock.request.urlPath
          || props.mock.request.urlPattern
          || props.mock.request.urlPathPattern
          || ''
        shouldWarn = ownUrl !== fullUrl
      }
      urlExists.value = shouldWarn
    } catch {
      if (seq !== urlCheckSeq) return
      // Soft check — never let a backend hiccup pollute the form.
      urlExists.value = false
    }
  },
)

// ── Name collision check (live) ───────────────────────────────
// Mirrors the URL collision check above: as the user types in the
// Mock Name field, ping the backend with the current project id +
// the trimmed mock name. Debounced 300ms to avoid one request per
// keystroke.
//
// Backend contract:
//   GET /api/mocks/projects/{projectId}/exists/by-name?name={name}
//     200 OK true  → a mock with that name already exists, surface
//                    a "Name already exists" warning under the input.
//     200 OK false → no collision; keep the UI silent.
// Other failures are swallowed silently — like the URL probe this is
// a soft, advisory signal and shouldn't decorate the form with a
// scary error while the user is mid-edit.
const nameExists = ref(false)
const debouncedMockName = useDebouncedRef(mockName, 300)
// Same sequence guard as the URL probe — protects against stale-write
// races when a slow earlier name check resolves after a fast later one.
let nameCheckSeq = 0

watch(
  () => [internalProjectId.value, debouncedMockName.value] as const,
  async ([projId, nameQuery]) => {
    const seq = ++nameCheckSeq
    const trimmedProjId = (projId ?? '').trim()
    const trimmedName = (nameQuery ?? '').trim()
    // Skip the probe for empty inputs — the required-field error already
    // covers the empty-name case and there's nothing to collide with.
    if (!trimmedProjId || !trimmedName) {
      nameExists.value = false
      return
    }
    try {
      const exists = await checkMockNameExists(trimmedProjId, trimmedName)
      if (seq !== nameCheckSeq) return // stale — a newer call is in flight
      // In edit mode, the name the user sees on entry belongs to the mock
      // they're already editing — don't warn them about themselves.
      if (exists && isEditMode.value && props.mock) {
        nameExists.value = (props.mock.name ?? '') !== trimmedName
      } else {
        nameExists.value = exists
      }
    } catch {
      if (seq !== nameCheckSeq) return
      // Soft check — never let a backend hiccup pollute the form.
      nameExists.value = false
    }
  },
)

// Edit-mode bootstrap: when the form is populated from an existing mock the
// stored URL already includes the `/{slug}` prefix (because we add it on
// save). The user-typed portion shown in the input is the part *after* the
// prefix, so we strip it once both pieces are available. Guarded by a flag
// so the strip only runs for the initial load — after that, the user is in
// charge of `urlValue` and re-triggering would clobber their edits.
const initialUrlSlugStripped = ref(false)
watch(
  () => [projectSlug.value, urlValue.value] as const,
  ([slug, current]) => {
    if (!isEditMode.value || initialUrlSlugStripped.value) return
    if (!slug || !current) return
    const prefix = `/${slug}`
    if (current === prefix) {
      urlValue.value = '/'
      initialUrlSlugStripped.value = true
    } else if (current.startsWith(prefix + '/')) {
      urlValue.value = current.slice(prefix.length)
      initialUrlSlugStripped.value = true
    } else {
      // Stored URL doesn't start with the current slug (legacy mock or
      // project rename). Leave it untouched and don't try again.
      initialUrlSlugStripped.value = true
    }
  },
)
const requestHeaders = ref<MatcherRow[]>([])
const queryParams = ref<MatcherRow[]>([])
const bodyPatterns = ref<BodyPatternRow[]>([])

// ── Form state: Cookies ───────────────────────────────────────
// A single list holds both request-side matchers and response-side
// `Set-Cookie` rows — each row's `direction` field distinguishes them.
// The Cookies section exposes two "+ Add" buttons (one per direction) so
// the user picks the role at the moment of creation rather than editing a
// toggle afterwards.
const cookies = ref<CookieRow[]>([])
function addCookieRow(direction: CookieRow['direction']) {
  cookies.value.push(createCookieRow({ direction }))
}

// ── Form state: Basic Auth ────────────────────────────────────
const enableBasicAuth = ref(false)
const basicAuthUsername = ref('')
const basicAuthPassword = ref('')
// Two ways to match Basic Auth on a WireMock stub:
//   'plain'  → `request.basicAuthCredentials = { username, password }`.
//              WireMock decodes the incoming Authorization header and
//              compares against the literal values we store.
//   'base64' → `request.headers.Authorization.equalTo = "Basic <b64>"`.
//              A straight header-matcher with the encoded value; handy
//              when you want to see the exact Authorization header
//              value the stub expects.
// Same username/password flow populates both — we only differ in how
// the payload is shaped on submit.
const basicAuthMode = ref<'plain' | 'base64'>('plain')

// ── Form state: Response ──────────────────────────────────────
const responseStatus = ref(200)
// Status Message is editable as a free-text field, but defaults to the
// canonical reason phrase for the selected Status Code (e.g. 201 →
// "Created"). The two-way binding lives in `responseStatusMessage`
// below: blank → fall back to the canonical phrase; otherwise, ship the
// user-typed value. The "Reset" button next to the input clears any
// override so the canonical phrase comes back.
const responseStatusMessageOverride = ref<string | null>(null)
const canonicalStatusMessage = computed(() => {
  const entry = HTTP_STATUS_CODES.find(s => s.value === responseStatus.value)
  if (!entry) return ''
  return entry.label.replace(/^\d+\s*/, '')
})
const responseStatusMessage = computed<string>({
  get: () => responseStatusMessageOverride.value ?? canonicalStatusMessage.value,
  set: (v: string) => {
    // Treat an empty value or one matching the canonical phrase as
    // "no override", so the field re-tracks the status code dropdown.
    if (!v.trim() || v.trim() === canonicalStatusMessage.value) {
      responseStatusMessageOverride.value = null
    } else {
      responseStatusMessageOverride.value = v
    }
  },
})
const isStatusMessageOverridden = computed(() => responseStatusMessageOverride.value !== null)


// Response-headers grid: each row is a single key/value pair. WireMock
// can technically emit a header multiple times on the wire (Vary, Link
// etc.) by passing a string[], but the form keeps it to one value per
// row to stay simple — users that genuinely need duplicates can add
// another row with the same key.
const responseHeaders = ref<KeyValuePair[]>([{ key: 'Content-Type', value: 'application/json' }])
// The on-wire body shape (jsonBody vs body vs base64Body) is derived from
// the response's Content-Type header instead of being a separate user
// choice — see `responseBodyFormat` below. Users rarely want the body
// payload type to disagree with the Content-Type they advertise, and in
// the old form they'd silently end up with e.g. `body: "<xml/>"` served
// with `Content-Type: application/json`.
const responseBody = ref('')
// Echo of the most recently uploaded file (filename + size in bytes) for
// the base64 upload helper. Declared up here so `populateFromMock` (run
// from an immediate watcher) can clear them without hitting the TDZ —
// the upload handler functions live further down with the other
// computeds.
const uploadedFileName = ref<string>('')
const uploadedFileSize = ref<number>(0)
const responseBodyFileError = ref<string>('')
// True while a picked response-body file is being read by FileReader. Drives
// an inline spinner so large files don't look like a no-op mid-read.
const responseBodyFileLoading = ref<boolean>(false)

// ── Form state: Delay ─────────────────────────────────────────
const enableDelay = ref(false)
const delayType = ref<'uniform' | 'lognormal' | 'fixed'>('uniform')
const delayLower = ref(50)
const delayUpper = ref(100)
const delayMedian = ref(100)
const delaySigma = ref(0.1)
const delayFixed = ref(100)

// ── Form state: Chunked Dribble Delay ─────────────────────────
const enableChunkedDribble = ref(false)
const chunkedNumberOfChunks = ref(5)
const chunkedTotalDuration = ref(1000)

// ── Form state: Fault Simulation ──────────────────────────────
const enableFault = ref(false)
const faultType = ref<'EMPTY_RESPONSE' | 'MALFORMED_RESPONSE_CHUNK' | 'RANDOM_DATA_THEN_CLOSE' | 'CONNECTION_RESET_BY_PEER'>('EMPTY_RESPONSE')

// ── Form state: Proxying ──────────────────────────────────────
const enableProxy = ref(false)
const proxyBaseUrl = ref('')
const additionalProxyHeaders = ref<ProxyHeaderRow[]>([])
const removeProxyHeaders = ref<string[]>([])
const removeProxyHeaderInput = ref('')

// ── Form state: Webhooks ──────────────────────────────────────
const enableWebhook = ref(false)
const webhookUrl = ref('')
const webhookMethod = ref('POST')
const webhookHeaders = ref<KeyValuePair[]>([])
const webhookBody = ref('')
const webhookDelayMs = ref(0)

// Reset every webhook field back to its empty default. Used both by the
// global form reset and by the on-toggle clear (turning the section off
// wipes the inputs so they don't silently re-arm if the user re-enables
// it later, and also drops any stale value the validation panel was
// flagging while the section was disabled).
function clearWebhookFields() {
  webhookUrl.value = ''
  webhookMethod.value = 'POST'
  webhookHeaders.value = []
  webhookBody.value = ''
  webhookDelayMs.value = 0
}

function setWebhookEnabled(next: boolean) {
  if (!next && enableWebhook.value) {
    // Toggling OFF — erase the form state so re-enabling later starts
    // from a clean slate (matches the user-facing expectation that
    // unchecking the section discards its contents).
    clearWebhookFields()
  }
  enableWebhook.value = next
}

// ── UI state ──────────────────────────────────────────────────
const isSubmitting = ref(false)
// Toast is rendered as `toastMode` in this component's template; alias from useToast.
const { showToast, toastMessage, toastType: toastMode, showToastMessage } = useToast()
// Tracks whether the user has attempted to submit at least once. Before the
// first submit attempt the errors panel still shows live (for guidance) but
// the submit button does not flash red; after a failed submit it does.
const submitAttempted = ref(false)

// ── WireMock stub status (edit mode only) ──────────────────────
// Mirrors the per-card behavior on ProjectDetailView: probe the admin
// port for the matching stub, and if it's missing surface a "click to
// create" action in the right aside so the user can re-install the stub
// from this mock without leaving the edit page.
//   'idle'     — not yet probed / not in edit mode
//   'loading'  — probe in flight
//   'exists'   — stub is present on WireMock
//   'missing'  — stub is absent, user can re-push
//   'creating' — re-push in flight
//   'error'    — probe failed (admin port unreachable); treated as
//                neutral so we don't mislabel a down admin as missing
type StubStatus = 'idle' | 'loading' | 'exists' | 'missing' | 'creating' | 'error'
const stubStatus = ref<StubStatus>('idle')
const stubErrorMsg = ref('')

async function refreshStubStatus() {
  if (!props.mock) return
  const id = props.mock.id
  stubStatus.value = 'loading'
  stubErrorMsg.value = ''
  try {
    const exists = await checkStubExists(id)
    stubStatus.value = exists ? 'exists' : 'missing'
  } catch (e) {
    stubStatus.value = 'error'
    stubErrorMsg.value = e instanceof Error ? e.message : 'Probe failed'
  }
}

// Re-install the stub on WireMock from the mock we were opened with.
// Uses the SAME flow as ProjectDetailView — POST /api/mocks/{id}/republish
// so the backend re-pushes the stored mock to WireMock under the existing
// id. We deliberately don't send the live form values: the form may
// contain unsaved edits, but "click to create" is about restoring the
// stored mock to WireMock, not about persisting unsaved form changes.
async function handleCreateStub() {
  if (!props.mock) return
  const m = props.mock
  stubStatus.value = 'creating'
  stubErrorMsg.value = ''
  try {
    await mockApi.republish(m.id)
    stubStatus.value = 'exists'
    showToastMessage(`Stub created for '${m.name}'`, BaseToastEnum.SUCCESS, 4000)
  } catch (e) {
    // Flip back to 'missing' so the user can retry.
    stubStatus.value = 'missing'
    stubErrorMsg.value = e instanceof Error ? e.message : 'Failed to create stub'
    showToastMessage(
      e instanceof Error ? `Failed to create stub: ${e.message}` : 'Failed to create stub',
      BaseToastEnum.ERROR,
    )
  }
}

// Kick off the probe whenever the mock prop lands. `immediate: true`
// covers the case where EditMockView has already resolved the mock by
// the time CreateMock mounts; the watcher also fires if the parent
// swaps in a different mock later.
watch(
  () => props.mock?.id,
  (id) => {
    if (id) {
      refreshStubStatus()
    } else {
      stubStatus.value = 'idle'
    }
  },
  { immediate: true },
)

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'TRACE', 'ANY'] as const

// Option tables for the lib BaseDropdown (options-as-data instead of
// <option> slots). Tables that already exist as {value,label}[] —
// MATCHER_TYPES, BODY_MATCHER_TYPES, HTTP_STATUS_CODES, etc. — are passed
// to :options directly; these cover the selects that used inline options.
const HTTP_METHOD_OPTIONS: DropdownOption[] = HTTP_METHODS.map((m) => ({ value: m, label: m }))
const URL_MATCH_TYPE_OPTIONS: DropdownOption[] = [
  { value: 'urlPath', label: 'Exact Path' },
  { value: 'url', label: 'Exact URL' },
  { value: 'urlPattern', label: 'URL Regex' },
  { value: 'urlPathPattern', label: 'Path Regex' },
]
const METADATA_VALUE_TYPE_OPTIONS: DropdownOption[] = [
  { value: 'text', label: 'Text' },
  { value: 'json', label: 'JSON' },
]
const DELAY_TYPE_OPTIONS: DropdownOption[] = [
  { value: 'uniform', label: 'Uniform' },
  { value: 'lognormal', label: 'Log-normal' },
  { value: 'fixed', label: 'Fixed' },
]
const SAME_SITE_OPTIONS: DropdownOption[] = [
  { value: '', label: '(unset)' },
  { value: 'Strict', label: 'Strict' },
  { value: 'Lax', label: 'Lax' },
  { value: 'None', label: 'None' },
]

const MATCHER_TYPES = [
  { value: 'equalTo', label: 'Equal To' },
  { value: 'matches', label: 'Regex' },
  { value: 'doesNotMatch', label: 'Not Regex' },
  { value: 'contains', label: 'Contains' },
  { value: 'absent', label: 'Absent' },
  { value: 'before', label: 'Before (date)' },
  { value: 'after', label: 'After (date)' },
  { value: 'equalToDateTime', label: 'Equal DateTime' },
] as const

// Body-pattern matcher kinds we expose in the form. Trimmed to the
// canonical WireMock body matchers — JSON Schema, the date-time
// matchers, and both regex matchers (`matches` / `doesNotMatch`) were
// removed per product spec; they're rare for body patterns or already
// covered by other matcher kinds.
const BODY_MATCHER_TYPES = [
  { value: 'equalTo', label: 'Equal To (string)' },
  { value: 'contains', label: 'Contains' },
  { value: 'equalToJson', label: 'Equal To JSON' },
  { value: 'matchesJsonPath', label: 'JSONPath' },
  { value: 'equalToXml', label: 'Equal To XML' },
  { value: 'matchesXPath', label: 'XPath' },
  { value: 'binaryEqualTo', label: 'Binary (base64)' },
] as const

// Body matcher kinds that honour the DateTime truncate/offset options.
const DATETIME_BODY_MATCHERS = new Set(['before', 'after', 'equalToDateTime'])
// Body matcher kinds that honour the xPathNamespaces fieldset.
const XML_NAMESPACE_BODY_MATCHERS = new Set(['matchesXPath', 'equalToXml'])
// Matcher kinds (in any context — query / header / cookie / body) that
// represent a date-time comparison and so can be authored via a calendar
// picker. WireMock also accepts the relative shorthand (`now +1 days`)
// which the user can type directly into the value field — the picker is
// just a convenience for picking absolute timestamps.
const DATETIME_MATCHERS = new Set(['before', 'after', 'equalToDateTime'])

// The picker's v-model is a zone-less `YYYY-MM-DDTHH:mm:ss` string
// (date-fns pattern) so it round-trips through the helpers below.
const PICKER_MODEL_TYPE = "yyyy-MM-dd'T'HH:mm:ss"

/**
 * Pull out the `YYYY-MM-DDTHH:mm:ss` portion of an ISO-8601 string so it can
 * be bound to BaseDateTimePicker (seconds default to `:00`). Returns null
 * when the value isn't a parseable ISO timestamp (e.g. it's a `now +1 days`
 * shorthand) — the picker then renders empty without clobbering the
 * user's text. */
function dateTimePickerValue(value: string | undefined): string | null {
  if (!value) return null
  const m = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?/)
  return m ? `${m[1]}${m[2] ?? ':00'}` : null
}

/**
 * Convert a picker value (e.g. `2024-01-01T12:30:00`) into a
 * WireMock-compatible ISO-8601 timestamp. We treat the picker's value as
 * UTC and append `Z` — users who need a specific local offset can still
 * hand-edit the text input afterwards. Empty pick clears the value. */
function setDateTimeFromPicker(row: { value: string }, picked: unknown): void {
  if (typeof picked !== 'string' || !picked) {
    row.value = ''
    return
  }
  const withSeconds = picked.length === 16 ? `${picked}:00` : picked
  row.value = `${withSeconds}Z`
}

// WireMock's supported truncation tokens for date-time matchers.
const TRUNCATE_OPTIONS = [
  { value: '', label: '(none)' },
  { value: 'first millisecond of second', label: 'first millisecond of second' },
  { value: 'first second of minute', label: 'first second of minute' },
  { value: 'first minute of hour', label: 'first minute of hour' },
  { value: 'first hour of day', label: 'first hour of day' },
  { value: 'first day of month', label: 'first day of month' },
  { value: 'first day of next month', label: 'first day of next month' },
  { value: 'first day of year', label: 'first day of year' },
  { value: 'first day of next year', label: 'first day of next year' },
] as const

// Units accepted on `expectedOffsetUnit`. Mirrors java.time.temporal.ChronoUnit.
const OFFSET_UNITS = [
  { value: '', label: '(unit)' },
  { value: 'SECONDS', label: 'seconds' },
  { value: 'MINUTES', label: 'minutes' },
  { value: 'HOURS', label: 'hours' },
  { value: 'DAYS', label: 'days' },
  { value: 'MONTHS', label: 'months' },
  { value: 'YEARS', label: 'years' },
] as const

// JSON Schema versions WireMock recognises (mirrors EverIt-org/json-schema).
const JSON_SCHEMA_VERSIONS = [
  { value: '', label: '(default — Draft-07)' },
  { value: 'V4', label: 'Draft 4' },
  { value: 'V6', label: 'Draft 6' },
  { value: 'V7', label: 'Draft 7' },
  { value: 'V201909', label: 'Draft 2019-09' },
  { value: 'V202012', label: 'Draft 2020-12' },
] as const

const REGEX_EXAMPLES: Record<string, { examples: string[]; tip: string }> = {
  matches: {
    examples: ['.*\\.json$', '^[A-Z]{2,4}$', '\\d{3}-\\d{4}', 'Bearer\\s+.+'],
    tip: 'Java-style regex. Must match the entire value.',
  },
  doesNotMatch: {
    examples: ['.*test.*', 'internal-.*', '\\d+'],
    tip: 'Matches when the regex does NOT match the value.',
  },
  urlPattern: {
    examples: ['/api/v[0-9]+/users/.*', '.*/orders/\\d+\\?.*', '/files/.*\\.pdf'],
    tip: 'Full URL regex including query string.',
  },
  urlPathPattern: {
    examples: ['/api/v[0-9]+/users/[a-f0-9-]+', '/items/\\d+', '/files/.*\\.json'],
    tip: 'Path-only regex (no query string).',
  },
  matchesJsonPath: {
    examples: ['$.name', '$.items[0].id', '$.users[?(@.age > 18)]', '$..status'],
    tip: 'JSONPath expression to match against the request body.',
  },
  matchesXPath: {
    examples: ['//user/name', '/root/items/item[@id="1"]', '//order[status="active"]'],
    tip: 'XPath expression to match against XML body.',
  },
}

function getRegexExamples(matcherType: string): { examples: string[]; tip: string } | null {
  return REGEX_EXAMPLES[matcherType] ?? null
}

// Short, human-readable description of each WireMock URL-match mode.
// Surfaced as helper text under the URL Match dropdown so the user knows
// what the chosen mode actually compares against (full URL with query
// string vs. path only, exact vs. regex) before they fill in the URL
// value below. Keeps the form self-documenting without forcing a trip
// to the WireMock docs.
const URL_MATCH_INFO: Record<string, string> = {
  url: 'Matches the full request URL exactly, including any query string — put the whole path and query in the URL field. The Query Parameters section is disabled in this mode because the query string is already part of this match; switch to Exact Path or Path Regex if you need separate query-parameter matchers.',
  urlPath: 'Matches the request path only and ignores the query string. Use the Query Parameters section below to assert on individual query parameters.',
  urlPattern: 'Matches the full URL (path + query string) against a Java regular expression. The Query Parameters section is disabled in this mode because the query string is matched by the pattern itself; switch to Path Regex if you need separate query-parameter matchers.',
  urlPathPattern: 'Matches the request path against a Java regular expression and ignores the query string. Ideal for variable path segments like /users/{id}. Use the Query Parameters section below to assert on individual query parameters.',
}

function getUrlMatchInfo(matchType: string): string {
  return URL_MATCH_INFO[matchType] ?? ''
}

// Common HTTP status codes grouped by class. Covers 1xx–5xx ranges
// typically seen in mock scenarios; keep list focused so the dropdown is usable.
const HTTP_STATUS_CODES = [
  { value: 100, label: '100 Continue' },
  { value: 101, label: '101 Switching Protocols' },
  { value: 200, label: '200 OK' },
  { value: 201, label: '201 Created' },
  { value: 202, label: '202 Accepted' },
  { value: 204, label: '204 No Content' },
  { value: 206, label: '206 Partial Content' },
  { value: 301, label: '301 Moved Permanently' },
  { value: 302, label: '302 Found' },
  { value: 303, label: '303 See Other' },
  { value: 304, label: '304 Not Modified' },
  { value: 307, label: '307 Temporary Redirect' },
  { value: 308, label: '308 Permanent Redirect' },
  { value: 400, label: '400 Bad Request' },
  { value: 401, label: '401 Unauthorized' },
  { value: 403, label: '403 Forbidden' },
  { value: 404, label: '404 Not Found' },
  { value: 405, label: '405 Method Not Allowed' },
  { value: 406, label: '406 Not Acceptable' },
  { value: 408, label: '408 Request Timeout' },
  { value: 409, label: '409 Conflict' },
  { value: 410, label: '410 Gone' },
  { value: 415, label: '415 Unsupported Media Type' },
  { value: 418, label: "418 I'm a teapot" },
  { value: 422, label: '422 Unprocessable Entity' },
  { value: 429, label: '429 Too Many Requests' },
  { value: 500, label: '500 Internal Server Error' },
  { value: 501, label: '501 Not Implemented' },
  { value: 502, label: '502 Bad Gateway' },
  { value: 503, label: '503 Service Unavailable' },
  { value: 504, label: '504 Gateway Timeout' },
  { value: 505, label: '505 HTTP Version Not Supported' },
] as const

// Common Content-Type values shown in the response-header dropdown when the
// header key is exactly `Content-Type` (case-insensitive).
const COMMON_RESPONSE_HEADERS = [
  'Content-Type',
  'Content-Length',
  'Content-Encoding',
  'Content-Disposition',
  'Content-Language',
  'Cache-Control',
  'ETag',
  'Expires',
  'Last-Modified',
  'Pragma',
  'Accept-Ranges',
  'Access-Control-Allow-Origin',
  'Access-Control-Allow-Methods',
  'Access-Control-Allow-Headers',
  'Access-Control-Allow-Credentials',
  'Access-Control-Expose-Headers',
  'Access-Control-Max-Age',
  'Authorization',
  'Location',
  'Retry-After',
  'Server',
  'Set-Cookie',
  'Strict-Transport-Security',
  'Transfer-Encoding',
  'Vary',
  'WWW-Authenticate',
  'X-Content-Type-Options',
  'X-Frame-Options',
  'X-Request-Id',
  'X-Correlation-Id',
  'X-RateLimit-Limit',
  'X-RateLimit-Remaining',
  'X-RateLimit-Reset',
] as const

const CONTENT_TYPES = [
  'application/json',
  'application/xml',
  'application/x-www-form-urlencoded',
  'application/octet-stream',
  'application/pdf',
  'application/javascript',
  'application/zip',
  'multipart/form-data',
  'text/plain',
  'text/html',
  'text/css',
  'text/csv',
  'text/xml',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/svg+xml',
  'image/webp',
] as const

const DELAY_TYPE_DESCRIPTIONS: Record<'uniform' | 'lognormal' | 'fixed', string> = {
  uniform: 'Random delay drawn uniformly between a lower and upper bound — every value in the range is equally likely. Use to simulate variable latency.',
  lognormal: 'Log-normally distributed delay with a median and sigma — produces a long tail where most responses cluster near the median but some are much slower. Closest to real-world network latency.',
  fixed: 'Every response is delayed by exactly the same number of milliseconds. Use for deterministic timing tests.',
}

// ── Helper: extract matcher type from a StringMatcher object ──
// NOTE: Declared BEFORE the populate watcher below because the watcher runs
// with `immediate: true`, which executes during setup. If STRING_MATCHER_KEYS
// were declared later, the immediate-fire path (edit mode, mock already loaded)
// would hit a TDZ ReferenceError.
const STRING_MATCHER_KEYS = [
  'equalTo', 'matches', 'doesNotMatch', 'contains',
  'before', 'after', 'equalToDateTime',
  'equalToJson', 'matchesJsonPath',
  'equalToXml', 'matchesXPath', 'binaryEqualTo',
] as const satisfies readonly (keyof StringMatcher)[]

function extractMatcher(val: StringMatcher): { matcherType: string; matcherValue: string; caseInsensitive: boolean } {
  const caseInsensitive = val.caseInsensitive === true
  for (const type of STRING_MATCHER_KEYS) {
    const v = val[type]
    if (v !== undefined) {
      return { matcherType: type, matcherValue: typeof v === 'string' ? v : JSON.stringify(v), caseInsensitive }
    }
  }
  if (val.absent === true) return { matcherType: 'absent', matcherValue: 'true', caseInsensitive }
  return { matcherType: 'equalTo', matcherValue: '', caseInsensitive }
}

// ── Basic Auth base64 helpers ─────────────────────────────────
// Safe UTF-8 ⇄ base64 round-trip. Plain `btoa(`${u}:${p}`)` throws on any
// non-Latin-1 character (e.g. an é in a username), so we encode the
// username:password pair through TextEncoder first, then base64 the bytes.
// `decodeBasicAuth` mirrors the inverse path and is tolerant of malformed
// input — it returns null when the value can't be decoded so callers can
// fall back gracefully (e.g. leave the form empty, ask the user to re-enter).
function encodeBasicAuth(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function decodeBasicAuth(b64: string): { username: string; password: string } | null {
  try {
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const decoded = new TextDecoder().decode(bytes)
    const idx = decoded.indexOf(':')
    if (idx === -1) return null
    return { username: decoded.slice(0, idx), password: decoded.slice(idx + 1) }
  } catch {
    return null
  }
}


// ── Populate from existing mock (edit mode) ───────────────────
// Watch the prop so the form resyncs if the parent swaps in a different mock
// (e.g. EditMockView loads the mock asynchronously and passes it in later).
watch(
  () => props.mock,
  (m) => {
    if (m) {
      populateFromMock(m)
    } else {
      // Default metadata: system-managed locked rows (project + generatedBy).
      // Users cannot delete or edit these — they're shipped on every mock.
      if (internalProjectId.value) {
        metadataRows.value = buildLockedMetadataRows(internalProjectId.value)
      } else {
        // No project yet → still seed `generatedBy` so it's always present.
        metadataRows.value = [{ key: 'generatedBy', value: 'wiremate', valueType: 'text', locked: true }]
      }
    }
  },
  { immediate: true },
)

function populateFromMock(m: MockResponse) {
  mockName.value = m.name
  description.value = m.description ?? ''
  internalProjectId.value = m.projectId
  // Allow the slug-strip watcher to run for this freshly-loaded mock.
  initialUrlSlugStripped.value = false
  persistent.value = m.persistent
  // When editing, only pre-fill priority if the mock actually has one set —
  // leave the field blank otherwise so the user isn't surprised by an
  // auto-assigned default they didn't choose.
  priority.value = m.priority
  // Top-level optional fields. WireMock omits these when unset; mirror
  // that on the form so blank inputs don't suddenly look "filled" after
  // a round-trip.

  // Metadata
  if (m.metadata && Object.keys(m.metadata).length > 0) {
    const rows: MetadataRow[] = Object.entries(m.metadata)
      // The cookie-attributes blob is system-managed — it's surfaced and
      // edited through the Cookies section, not the raw metadata grid.
      .filter(([key]) => key !== COOKIE_ATTRS_METADATA_KEY)
      // Drop any legacy `project` key — we render it as `projectId` below
      // (see the unshift). Without this filter, a mock saved under the old
      // schema would render with both `project` AND `projectId` rows.
      .filter(([key]) => key !== 'project')
      .map(([key, value]) => {
        const isObject = typeof value === 'object' && value !== null
        const isLocked = LOCKED_METADATA_KEYS.has(key)
        // For `generatedBy` we always force the canonical value, regardless of
        // whatever the persisted mock happened to carry — the user can't
        // tamper with this field, so neither can stale data.
        const canonicalValue = key === 'generatedBy'
          ? 'wiremate'
          : (typeof value === 'string' ? value : JSON.stringify(value, null, 2))
        return {
          key,
          value: canonicalValue,
          valueType: key === 'generatedBy' ? 'text' as const : (isObject ? 'json' as const : 'text' as const),
          locked: isLocked,
        }
      })
    // Guarantee the projectId row is present. The mock's owning project
    // is authoritative — we use `m.projectId`, not whatever may (or may
    // not) have been persisted in the metadata blob — so legacy mocks
    // stored under the old `project` key still get the canonical
    // `projectId` row here.
    if (!rows.some(r => r.key === 'projectId')) {
      rows.unshift({ key: 'projectId', value: m.projectId, valueType: 'text', locked: true })
    }
    // Guarantee `generatedBy` is present even if the stored mock predates it.
    if (!rows.some(r => r.key === 'generatedBy')) {
      rows.push({ key: 'generatedBy', value: 'wiremate', valueType: 'text', locked: true })
    }
    metadataRows.value = rows
    collapsedSections.value.metadata = false
  } else {
    // Ensure system-managed metadata always exists in edit mode
    metadataRows.value = buildLockedMetadataRows(m.projectId)
  }

  // Request - Method
  httpMethod.value = m.request.method

  // Request - URL
  if (m.request.url) {
    urlMatchType.value = 'url'
    urlValue.value = m.request.url
  } else if (m.request.urlPath) {
    urlMatchType.value = 'urlPath'
    urlValue.value = m.request.urlPath
  } else if (m.request.urlPattern) {
    urlMatchType.value = 'urlPattern'
    urlValue.value = m.request.urlPattern
  } else if (m.request.urlPathPattern) {
    urlMatchType.value = 'urlPathPattern'
    urlValue.value = m.request.urlPathPattern
  }

  // Request - Headers
  if (m.request.headers) {
    requestHeaders.value = Object.entries(m.request.headers).map(([key, val]) => {
      const { matcherType, matcherValue, caseInsensitive } = extractMatcher(val)
      return { key, matcherType, value: matcherValue, caseInsensitive }
    })
  }

  // Request - Cookies
  // Hydrate request-side cookies into CookieRow entries with
  // direction='request'. The response-side rows are added later from the
  // Set-Cookie parsing below; both groups live together in `cookies.value`.
  if (m.request.cookies && Object.keys(m.request.cookies).length > 0) {
    const requestCookieRows: CookieRow[] = []
    for (const [key, val] of Object.entries(m.request.cookies)) {
      const { matcherType, matcherValue, caseInsensitive } = extractMatcher(val)
      requestCookieRows.push(createCookieRow({
        direction: 'request',
        key,
        matcherType,
        value: matcherValue,
        caseInsensitive,
      }))
    }
    cookies.value = requestCookieRows
    collapsedSections.value.cookies = false
  }

  // Request - Query parameters
  if (m.request.queryParameters) {
    queryParams.value = Object.entries(m.request.queryParameters).map(([key, val]) => {
      const { matcherType, matcherValue, caseInsensitive } = extractMatcher(val)
      return { key, matcherType, value: matcherValue, caseInsensitive }
    })
  }

  // Request - Body patterns
  if (m.request.bodyPatterns && m.request.bodyPatterns.length > 0) {
    const BODY_MATCHER_KEYS = [
      'equalToJson', 'matchesJsonPath', 'matchesJsonSchema', 'equalTo', 'contains',
      'matches', 'doesNotMatch', 'equalToXml', 'matchesXPath', 'binaryEqualTo',
      'before', 'after', 'equalToDateTime',
    ] as const satisfies readonly (keyof BodyPattern)[]

    bodyPatterns.value = m.request.bodyPatterns.map((bp) => {
      const row: BodyPatternRow = {
        matcherType: 'equalToJson',
        value: '',
        ignoreArrayOrder: false,
        ignoreExtraElements: false,
      }
      for (const type of BODY_MATCHER_KEYS) {
        const val = bp[type]
        if (val !== undefined) {
          row.matcherType = type
          row.value = typeof val === 'string' ? val : JSON.stringify(val, null, 2)
          break
        }
      }
      if (bp.absent === true) {
        row.matcherType = 'absent'
        row.value = 'true'
      }
      row.ignoreArrayOrder = bp.ignoreArrayOrder ?? false
      row.ignoreExtraElements = bp.ignoreExtraElements ?? false

      // Hydrate advanced per-matcher fields. Each branch reads from the
      // raw BodyPattern shape — matchesJsonPath can come back as either a
      // bare expression string or the object form
      // `{ expression, varyBy?, equalTo?|contains?|matches?|… }`. When
      // we see a sub-matcher key we hoist it onto the row so the UI
      // dropdown reflects it and the round-trip preserves the shape.
      if (row.matcherType === 'matchesJsonPath') {
        const raw = bp.matchesJsonPath
        if (raw && typeof raw === 'object') {
          const obj = raw as Record<string, unknown>
          row.value = String(obj.expression ?? '')
          const varyBy = obj['vary-by'] ?? obj.varyBy
          if (typeof varyBy === 'string') row.varyBy = varyBy
          // Detect any of the known sub-matcher kinds. We pull only the
          // first one we recognise — WireMock's wire shape never carries
          // two competing sub-matchers in the same object.
          const subKinds = ['equalTo', 'contains', 'matches', 'doesNotMatch', 'equalToJson', 'equalToXml', 'absent']
          for (const kind of subKinds) {
            if (kind in obj) {
              row.jsonPathSubMatcher = kind
              const sv = obj[kind]
              if (kind === 'absent') {
                row.jsonPathSubMatcherValue = ''
              } else if (typeof sv === 'string') {
                row.jsonPathSubMatcherValue = sv
              } else {
                // equalToJson can come in as a parsed object; stringify
                // so the textarea shows the schema/document.
                row.jsonPathSubMatcherValue = JSON.stringify(sv)
              }
              break
            }
          }
        }
      }
      if (row.matcherType === 'matchesJsonSchema') {
        if (bp.schemaVersion) row.schemaVersion = bp.schemaVersion
      }
      if (row.matcherType === 'matchesXPath') {
        const raw = bp.matchesXPath
        if (raw && typeof raw === 'object') {
          row.value = String((raw as { expression?: unknown }).expression ?? '')
        }
      }
      if (XML_NAMESPACE_BODY_MATCHERS.has(row.matcherType) && bp.xPathNamespaces) {
        row.xPathNamespaces = Object.entries(bp.xPathNamespaces)
          .map(([prefix, uri]) => ({ prefix, uri: String(uri) }))
      }
      if (row.matcherType === 'equalToXml' && bp.enablePlaceholders) {
        row.enablePlaceholders = true
      }
      if (DATETIME_BODY_MATCHERS.has(row.matcherType)) {
        if (typeof bp.truncateExpected === 'string') row.truncateExpected = bp.truncateExpected
        if (typeof bp.truncateActual === 'string') row.truncateActual = bp.truncateActual
        if (typeof bp.expectedOffset === 'number') row.expectedOffset = bp.expectedOffset
        if (typeof bp.expectedOffsetUnit === 'string') row.expectedOffsetUnit = bp.expectedOffsetUnit
      }
      return row
    })
  }

  // Request - Basic Auth
  // Two shapes are possible on a stored mock:
  //   1) `basicAuthCredentials: { username, password }` — populated by the
  //      "plain" mode of this form, decoded by WireMock from the incoming
  //      Authorization header.
  //   2) `headers.Authorization.equalTo = "Basic <b64>"` — populated by the
  //      "base64" mode (or hand-edited stubs from a curl example). We need
  //      to detect this AFTER the headers loop has run so we can both decode
  //      the credentials AND remove the Authorization row from
  //      `requestHeaders` — leaving it there would double-emit the matcher
  //      on save (once via headers, once via the basic-auth section).
  if (m.request.basicAuthCredentials) {
    enableBasicAuth.value = true
    basicAuthMode.value = 'plain'
    basicAuthUsername.value = m.request.basicAuthCredentials.username
    basicAuthPassword.value = m.request.basicAuthCredentials.password
    collapsedSections.value.basicAuth = false
  } else {
    // Find the Authorization row, case-insensitively (HTTP header names are
    // case-insensitive; users may have typed `authorization`).
    const authIdx = requestHeaders.value.findIndex(h => h.key.trim().toLowerCase() === 'authorization')
    if (authIdx !== -1) {
      const authRow = requestHeaders.value[authIdx]
      // Only the equalTo matcher carries a literal value we can decode.
      // Regex/contains matchers stay as plain header rows.
      if (authRow.matcherType === 'equalTo' && authRow.value.startsWith('Basic ')) {
        const decoded = decodeBasicAuth(authRow.value.slice('Basic '.length).trim())
        if (decoded) {
          enableBasicAuth.value = true
          basicAuthMode.value = 'base64'
          basicAuthUsername.value = decoded.username
          basicAuthPassword.value = decoded.password
          requestHeaders.value.splice(authIdx, 1)
          collapsedSections.value.basicAuth = false
        }
      }
    }
  }

  // Response
  responseStatus.value = m.response.status
  // Honor a stored custom reason phrase if the user (or another tool)
  // set one explicitly. We compare against the canonical phrase for the
  // status code and only treat it as an override when it differs — that
  // way round-tripping a stub that just had `200 OK` doesn't leave the
  // override flag flipped on.
  if (typeof m.response.statusMessage === 'string' && m.response.statusMessage) {
    const canonical = HTTP_STATUS_CODES.find(s => s.value === m.response.status)?.label.replace(/^\d+\s*/, '') ?? ''
    responseStatusMessageOverride.value = m.response.statusMessage === canonical ? null : m.response.statusMessage
  } else {
    responseStatusMessageOverride.value = null
  }

  if (m.response.headers) {
    // Parse `Set-Cookie` entries out of the generic headers grid and hydrate
    // them into the Cookies section. The same header can be serialized as
    // either a single string or a string[] (WireMock accepts both); support
    // both shapes so we don't lose cookies when editing.
    const parsedCookies: CookieRow[] = []
    const remainingHeaders: KeyValuePair[] = []
    for (const [key, value] of Object.entries(m.response.headers)) {
      if (key.toLowerCase() === 'set-cookie') {
        const rawValues = Array.isArray(value) ? value : [value]
        for (const raw of rawValues) {
          const parsed = parseSetCookieString(String(raw))
          // parseSetCookieString seeds via createCookieRow, which defaults
          // direction='response' — exactly what we want for Set-Cookie.
          if (parsed) parsedCookies.push(parsed)
        }
        continue
      }
      // Non-cookie headers: a string[] (WireMock's multi-value form)
      // is split into one row per value so each can be edited
      // individually. Single-value headers stay as a plain row.
      if (Array.isArray(value)) {
        for (const v of value) {
          remainingHeaders.push({ key, value: String(v) })
        }
      } else {
        remainingHeaders.push({ key, value: String(value) })
      }
    }
    responseHeaders.value = remainingHeaders
    if (parsedCookies.length > 0) {
      // Append response cookies to whatever request-side rows the earlier
      // pass already pushed into `cookies.value`.
      cookies.value = [...cookies.value, ...parsedCookies]
      collapsedSections.value.cookies = false
    }
  }

  // The body type is now inferred from Content-Type, so we only seed the
  // textarea contents.
  // Reset any "uploaded file" echo state from a previous edit-mode load.
  // The persisted mock only stores the base64 payload (not the original
  // filename), so we can't reconstruct the chip — the user can re-upload
  // if they want to swap the asset.
  uploadedFileName.value = ''
  uploadedFileSize.value = 0
  responseBodyFileError.value = ''
  if (m.response.jsonBody !== undefined) {
    responseBody.value = JSON.stringify(m.response.jsonBody, null, 2)
  } else if (m.response.base64Body) {
    responseBody.value = m.response.base64Body
  } else if (m.response.bodyFileName) {
    // Legacy bodyFileName mocks: the file-reference UI was removed, so we
    // load the path string into the body textarea as a graceful migration.
    // It will be re-saved as a plain `body` rather than `bodyFileName`.
    responseBody.value = m.response.bodyFileName
  } else if (m.response.body) {
    responseBody.value = m.response.body
  }

  // Delay
  if (m.response.delayDistribution) {
    enableDelay.value = true
    delayType.value = m.response.delayDistribution.type
    if (m.response.delayDistribution.type === 'uniform') {
      delayLower.value = m.response.delayDistribution.lower ?? 50
      delayUpper.value = m.response.delayDistribution.upper ?? 100
    } else if (m.response.delayDistribution.type === 'lognormal') {
      delayMedian.value = m.response.delayDistribution.median ?? 100
      delaySigma.value = m.response.delayDistribution.sigma ?? 0.1
    } else if (m.response.delayDistribution.type === 'fixed') {
      delayFixed.value = m.response.delayDistribution.milliseconds ?? 100
    }
  } else if (m.response.fixedDelayMilliseconds) {
    enableDelay.value = true
    delayType.value = 'fixed'
    delayFixed.value = m.response.fixedDelayMilliseconds
  }

  // Chunked dribble delay
  if (m.response.chunkedDribbleDelay) {
    enableChunkedDribble.value = true
    chunkedNumberOfChunks.value = m.response.chunkedDribbleDelay.numberOfChunks
    chunkedTotalDuration.value = m.response.chunkedDribbleDelay.totalDuration
    collapsedSections.value.chunkedDribble = false
  }

  // Fault
  if (m.response.fault) {
    enableFault.value = true
    faultType.value = m.response.fault
    collapsedSections.value.faultSimulation = false
  }

  // Proxying
  if (m.response.proxyBaseUrl) {
    enableProxy.value = true
    proxyBaseUrl.value = m.response.proxyBaseUrl
    if (m.response.additionalProxyRequestHeaders) {
      additionalProxyHeaders.value = Object.entries(m.response.additionalProxyRequestHeaders).map(([key, value]) => ({ key, value }))
    }
    if (m.response.removeProxyRequestHeaders) {
      removeProxyHeaders.value = [...m.response.removeProxyRequestHeaders]
    }
    collapsedSections.value.proxying = false
  }

  // Webhooks
  // Prefer the modern `serveEventListeners` array (WireMock 3.1.0+). A
  // single stub can carry multiple listeners — we only model the
  // "webhook" one in this UI, so pick the first entry with that name.
  // Fall back to the legacy `postServeActions.webhook` map so stubs
  // created before the migration still round-trip cleanly; on next save
  // they'll be rewritten in the new shape by `buildMockPayload`.
  const webhookListener = m.serveEventListeners?.find(l => l.name === 'webhook')
  const legacyWebhook = m.postServeActions?.webhook
  // Listener `parameters` is intentionally opaque on the wire, so we
  // narrow through a typed view of just the fields this UI renders.
  const webhookParams = webhookListener
    ? (webhookListener.parameters as Partial<WebhookDefinition>)
    : legacyWebhook
  if (webhookParams?.url) {
    enableWebhook.value = true
    webhookUrl.value = webhookParams.url
    // Default to POST — WireMock's own default when `method` is omitted.
    webhookMethod.value = webhookParams.method ?? 'POST'
    if (webhookParams.headers) {
      webhookHeaders.value = Object.entries(webhookParams.headers).map(([key, value]) => ({ key, value }))
    }
    webhookBody.value = webhookParams.body ?? ''
    webhookDelayMs.value = webhookParams.delay?.milliseconds ?? 0
    collapsedSections.value.webhooks = false
  }
}

// ── Computed classes ──────────────────────────────────────────
// Field skin (label / input / required-red-input) comes from the shared
// lib composable; local names are kept so the template stays unchanged.
const { label: labelClasses, input: inputClasses, requiredInput: requiredInputClasses } = useFieldClasses()

const sectionClasses = computed(() =>
  t.cardAlt
)

const headingClasses = computed(() =>
  isDark.value ? 'text-gray-100' : 'text-gray-700'
)

// `collapsibleHeaderClasses` used to live here; it's now owned by
// CollapsibleSection.vue along with the rest of the section header
// scaffold.

// ── Key/value row validators ─────────────────────────────────
// Shared lib validators for every key-matcher-value row in the form
// (request headers, response headers, proxy headers, webhook headers,
// query params, cookies). The `absent` matcher exemption lives in the lib.
const isMatcherRowValueMissing = rowValueMissing
const isMatcherRowKeyMissing = rowKeyMissing

// ── Body pattern combination validator ────────────────────────
// WireMock body patterns are AND-combined, so stacking multiple patterns is
// a valid and powerful feature (e.g. "contains `error`" AND "matches regex").
// A few combinations, however, are nonsensical and produce stubs that can
// never match:
//   - More than one literal-body matcher (equalTo / equalToJson / equalToXml
//     / binaryEqualTo) — a body can only equal one thing at a time.
//   - `absent` combined with any other matcher — a body can't simultaneously
//     be missing and contain a value.
//   - `equalToJson` with a value that isn't parseable JSON.
//   - `equalToXml` with a value that isn't parseable XML.
// Returns an array of user-facing issue strings.
const LITERAL_BODY_MATCHER_SET = new Set(['equalTo', 'equalToJson', 'equalToXml', 'binaryEqualTo'])
function findBodyPatternIssues(rows: Array<{ matcherType?: string; value?: string }>): string[] {
  const issues: string[] = []
  if (!rows || rows.length === 0) return issues

  const literalCount = rows.filter(r => LITERAL_BODY_MATCHER_SET.has(r.matcherType ?? '')).length
  if (literalCount > 1) {
    issues.push('Only one literal-body matcher (equalTo, equalToJson, equalToXml, binaryEqualTo) is allowed — a request body can only equal one thing.')
  }

  const absentCount = rows.filter(r => r.matcherType === 'absent').length
  if (absentCount > 0 && rows.length > 1) {
    issues.push('`absent` cannot be combined with other body patterns — a body can\'t simultaneously be missing and contain a value.')
  }
  if (absentCount > 1) {
    issues.push('Only one `absent` body pattern is allowed.')
  }

  // Per-row format validation. Empty values are tolerated (the user is
  // mid-edit); only flag when something has been typed and it doesn't
  // parse. We index the row in the message so the user can locate it.
  rows.forEach((r, i) => {
    const value = (r.value ?? '').trim()
    if (!value) return
    if (r.matcherType === 'equalToXml' && !isValidXml(value)) {
      issues.push(`Body pattern #${i + 1} (equalToXml) is not valid XML.`)
    }
    if (r.matcherType === 'equalToJson' && !isValidJson(value)) {
      issues.push(`Body pattern #${i + 1} (equalToJson) is not valid JSON.`)
    }
  })

  return issues
}

// Per-row helper used by the textarea's inline validation. Returns a
// short user-facing error string when the row's value fails the format
// implied by its matcher kind, or '' when valid / not applicable.
function bodyPatternRowFormatError(row: { matcherType?: string; value?: string }): string {
  const value = (row.value ?? '').trim()
  if (!value) return ''
  if (row.matcherType === 'equalToXml' && !isValidXml(value)) {
    return 'Not valid XML.'
  }
  if (row.matcherType === 'equalToJson' && !isValidJson(value)) {
    return 'Not valid JSON.'
  }
  return ''
}

// `badgeClasses` used to live here; CollapsibleSection.vue now owns the
// "Active" / count pill styling so callers don't have to thread it.

// ── Helpers ───────────────────────────────────────────────────
function addRow(list: KeyValuePair[]) {
  list.push({ key: '', value: '' })
}

// Generic so each call site keeps its element type — was previously
// `list: any[]`, the only `any` in production code. The function only
// uses `.splice`, which is on every Array<T>, so the constraint is just
// "is an array".
function removeRow<T>(list: T[], index: number): void {
  list.splice(index, 1)
}

function isContentTypeHeader(key: string | undefined): boolean {
  return (key ?? '').trim().toLowerCase() === 'content-type'
}

// Returns the dropdown options for a Content-Type header. If the current
// value isn't in our standard list (e.g. it came from an imported mock),
// prepend it so the select still displays the existing value instead of
// silently blanking it out.
function contentTypeOptions(current: string | undefined): readonly string[] {
  const value = (current ?? '').trim()
  if (!value || (CONTENT_TYPES as readonly string[]).includes(value)) {
    return CONTENT_TYPES
  }
  return [value, ...CONTENT_TYPES]
}

function responseHeaderOptions(current: string | undefined): string[] {
  const value = (current ?? '').trim()
  const list = [...COMMON_RESPONSE_HEADERS] as string[]
  if (value && !list.includes(value) && value !== '__custom__') {
    list.unshift(value)
  }
  return list
}

// Same list shaped for BaseDropdown, with the "Custom..." escape hatch
// appended (mirrors the old select's `__custom__` sentinel option).
function responseHeaderNameOptions(current: string | undefined): DropdownOption[] {
  return [
    ...responseHeaderOptions(current).map((h) => ({ value: h, label: h })),
    { value: '__custom__', label: 'Custom...' },
  ]
}

function addMatcherRow(list: MatcherRow[]) {
  list.push({ key: '', matcherType: 'equalTo', value: '', caseInsensitive: false })
}

function addBodyPatternRow() {
  bodyPatterns.value.push({ matcherType: 'equalToJson', value: '', ignoreArrayOrder: false, ignoreExtraElements: false })
}




// isValidBase64 / isValidXml / isValidJson migrated to mgv-backoffice
// (v1.34.0) — imported at the top of this file. Empty input counts as
// valid for all three; required-ness is checked separately.

// ── Metadata row validation ───────────────────────────────────
// Keys are serialized verbatim as JSON object property names. Any string is
// technically a valid JSON key, but in practice a key containing whitespace
// (spaces, tabs, newlines) almost always indicates a user typo — it would
// require awkward bracket-notation access and breaks common filter tooling.
// `locked` rows (e.g. the auto-managed `project` row) bypass this check
// because the value is controlled programmatically.
function isMetadataKeyInvalid(row: { key?: string; locked?: boolean }): boolean {
  if (row.locked) return false
  const key = row.key ?? ''
  if (!key) return false // empty key is flagged separately by the value-requires-key rule
  return /\s/.test(key)
}

// If a metadata row has a key, it must also have a value. Matches the
// behavior already applied to headers and query params. `locked` rows are
// managed internally, so skip.
function isMetadataValueMissing(row: { key?: string; value?: string; locked?: boolean }): boolean {
  if (row.locked) return false
  const key = (row.key ?? '').trim()
  if (!key) return false
  return !(row.value ?? '').trim()
}

// ── Duplicate-key detection (metadata + request headers) ──────
// Metadata object keys and request-header matcher names must be unique:
// two rows sharing a key silently collide into a single entry on the
// wire (last write wins), so we block submission and highlight the
// clashing rows. Metadata keys are case-sensitive (arbitrary JSON object
// keys); HTTP header names are compared case-insensitively, mirroring the
// existing response-header duplicate rule. Each computed returns the set
// of offending keys (already-canonicalised for headers) so both the
// validation list and the per-row inline highlight read from one source.
const duplicateMetadataKeys = computed<Set<string>>(() => {
  const counts = new Map<string, number>()
  for (const r of metadataRows.value) {
    if (r.locked) continue
    const key = (r.key ?? '').trim()
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k))
})

const duplicateRequestHeaderKeys = computed<Set<string>>(() => {
  const counts = new Map<string, number>()
  for (const h of requestHeaders.value) {
    const name = (h.key ?? '').trim()
    if (!name) continue
    const canonical = name.toLowerCase()
    counts.set(canonical, (counts.get(canonical) ?? 0) + 1)
  }
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k))
})

// True when this row's (non-empty) key collides with another row's key.
function isDuplicateMetadataKey(row: { key?: string; locked?: boolean }): boolean {
  if (row.locked) return false
  const key = (row.key ?? '').trim()
  return !!key && duplicateMetadataKeys.value.has(key)
}
function isDuplicateRequestHeaderKey(row: { key?: string }): boolean {
  const name = (row.key ?? '').trim()
  return !!name && duplicateRequestHeaderKeys.value.has(name.toLowerCase())
}

// ── ms → seconds live conversion helper ───────────────────────
// Every form field that collects a duration in milliseconds (delays,
// chunked dribble, webhook firing delay) renders a tiny "= 1.50 s" hint
// below the input — lib formatter.
const formatMsAsSeconds = fmtMsAsSeconds

// ── URL path validation ───────────────────────────────────────
// Validates that the value is a proper URL path:
//   - Must start with /
//   - Only allows: letters, digits, -, _, ., ~, /, :, @, !, $, &, ', (, ), *, +, ,, ;, =, %, {, }
//   - For `url` (Exact URL) the value is the full URL, so `?` is also
//     allowed (the query string lives inline in this mode).
//   - For regex URL match types, also allow regex chars: ^, $, ., *, +, ?, (, ), [, ], {, }, |, \
//   - Must have at least one segment after the leading /
function isValidUrlPath(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '/') return false
  if (!trimmed.startsWith('/')) return false

  if (urlMatchType.value === 'urlPattern' || urlMatchType.value === 'urlPathPattern') {
    // Regex patterns: allow most printable chars but reject spaces and control chars
    return /^\/[^\s]+$/.test(trimmed)
  }

  if (urlMatchType.value === 'url') {
    // Exact URL: full path + query string, so `?` is permitted inline.
    return /^\/[a-zA-Z0-9\-._~/:@!$&'()*+,;=%?{}]+$/.test(trimmed)
  }

  // Strict path validation for exact path match (urlPath) — no query string.
  return /^\/[a-zA-Z0-9\-._~/:@!$&'()*+,;=%{}]+$/.test(trimmed)
}

// ── Response body format inference ────────────────────────────
// The body-type dropdown used to be an independent toggle, but it's now
// derived from the `Content-Type` response header so the two can never
// disagree (serving `<xml/>` with `Content-Type: application/json` was
// a common footgun in the old UI).
//
// Resolution order:
//   1. Honor the first response header whose key, case-insensitively,
//      is `Content-Type`. If the row has a blank value we fall back to
//      the next step.
//   2. Default to `application/json` — matches the form's seeded
//      Content-Type row and keeps backward compatibility with pre-flip
//      saved mocks that just had `jsonBody` set.
const responseContentType = computed<string>(() => {
  for (const h of responseHeaders.value) {
    if (h.key.trim().toLowerCase() === 'content-type' && h.value.trim()) {
      return h.value.trim()
    }
  }
  return 'application/json'
})

// Classify the response body into one of four payload shapes based on
// the Content-Type. We tolerate structured-suffix types (e.g.
// `application/problem+json`, `application/atom+xml`) and the common
// binary families so the UI does the right thing without the user
// having to think about WireMock's three body fields.
//
//   - 'json'  → validate as JSON, emit as `jsonBody`
//   - 'xml'   → validate as XML, emit as `body` (WireMock has no
//               dedicated xmlBody field — literal text is correct)
//   - 'base64'→ validate as base64, emit as `base64Body` (binary types)
//   - 'text'  → no format validation, emit as `body`
const responseBodyFormat = computed<'json' | 'xml' | 'base64' | 'text'>(() => {
  const ct = responseContentType.value.toLowerCase().split(';')[0].trim()
  if (!ct) return 'text'
  if (/^(application|text)\/([a-z0-9.+\-]*\+)?json$/.test(ct)) return 'json'
  if (/^(application|text|image)\/([a-z0-9.+\-]*\+)?xml$/.test(ct)) return 'xml'
  // Binary-ish MIME families that users will want to paste as base64.
  // We exclude `image/svg+xml` (caught by the xml branch above) because
  // SVG is literal XML text, not base64.
  if (
    ct === 'application/octet-stream'
    || ct === 'application/pdf'
    || ct === 'application/zip'
    || ct === 'application/x-zip-compressed'
    || ct === 'application/gzip'
    || ct.startsWith('image/')
    || ct.startsWith('audio/')
    || ct.startsWith('video/')
    || ct.startsWith('font/')
  ) return 'base64'
  return 'text'
})

// Human-readable label for the detected body format — shown as a small
// pill next to the Response Body label so the user knows what the form
// is validating against.
const responseBodyFormatLabel = computed(() => {
  switch (responseBodyFormat.value) {
    case 'json':   return 'JSON'
    case 'xml':    return 'XML'
    case 'base64': return 'Base64'
    default:       return 'Text'
  }
})

// Live validation error for the response body, scoped to the currently
// detected format. Returns '' when valid or when the field is empty.
const responseBodyFormatError = computed(() => {
  const body = responseBody.value
  if (!body.trim()) return ''
  switch (responseBodyFormat.value) {
    case 'json':   return isValidJson(body) ? '' : `Invalid JSON for Content-Type ${responseContentType.value}.`
    case 'xml':    return isValidXml(body) ? '' : `Invalid XML for Content-Type ${responseContentType.value}.`
    case 'base64': return isValidBase64(body) ? '' : `Invalid base64 for Content-Type ${responseContentType.value}.`
    default:       return ''
  }
})


// ── Response body file upload ─────────────────────────────────
// Surfaced as an "Upload file" button whenever the user has picked a
// Content-Type. The handler dispatches based on `responseBodyFormat`:
//
//   - JSON  → read as text, validate as parseable JSON.
//   - XML   → read as text, validate as parseable XML.
//   - Text  → read as text, no parse validation (free-form).
//   - Base64 → read as data URL, strip `data:<mime>;base64,` prefix,
//             write the bare base64 payload into `responseBody`.
//
// A pre-read MIME / extension check rejects files that obviously don't
// match the chosen Content-Type — e.g. uploading `foo.txt` while the
// header says `image/png`. Any post-read parse failure (e.g. malformed
// JSON) is surfaced via `responseBodyFileError` and the uploaded file
// is rolled back so the user is left in a known state. The state refs
// themselves are declared further up alongside `responseBody` so the
// immediate edit-mode watcher can touch them without tripping a
// temporal-dead-zone error.

// `accept` attribute for the file picker. Narrows to the exact MIME when
// possible (e.g. `image/png`) and broadens to a family when the response
// header is a wildcard or unknown subtype. Falls back to `*/*` so users
// can still upload anything they like.
const responseBodyFileAccept = computed<string>(() => {
  const ct = responseContentType.value.toLowerCase().split(';')[0].trim()
  if (!ct) return '*/*'
  // Narrow MIME — use as-is.
  if (/^[a-z]+\/[a-z0-9.+\-]+$/.test(ct)) return ct
  return '*/*'
})

// Lightweight MIME-vs-Content-Type compatibility check, used to reject
// obviously mismatched uploads before we read them. We're forgiving when
// the browser reports an empty/octet-stream MIME (some OSes do that for
// uncommon types) and fall back to extension sniffing in that case.
const EXTENSION_TO_MIME: Record<string, string> = {
  json: 'application/json',
  xml: 'application/xml',
  txt: 'text/plain',
  csv: 'text/csv',
  html: 'text/html',
  htm: 'text/html',
  md: 'text/markdown',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  zip: 'application/zip',
  gz: 'application/gzip',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  webm: 'video/webm',
}

function isFileCompatibleWithContentType(file: File, contentType: string): boolean {
  const ct = contentType.toLowerCase().split(';')[0].trim()
  if (!ct) return true
  const fileMime = (file.type || '').toLowerCase().trim()
  // No browser-reported MIME — fall back to the file extension.
  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase() : ''
  const inferred = fileMime || EXTENSION_TO_MIME[ext] || ''
  if (!inferred) return true // unknown — let the user proceed and validate the parsed contents instead
  if (inferred === ct) return true
  // Family match: image/png against image/* etc. — lets the user upload
  // any image variant when the Content-Type is a generic family. Both
  // sides must share their primary type.
  const [topA, subA] = ct.split('/')
  const [topB, subB] = inferred.split('/')
  if (topA === topB && (subA === '*' || subB === '*')) return true
  return false
}

function handleResponseBodyFileUpload(ev: Event): void {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  // Allow the same file to be picked twice in a row by clearing the
  // input — `change` only fires when the value actually changes.
  input.value = ''
  if (!file) return
  responseBodyFileError.value = ''

  const ct = responseContentType.value
  if (!isFileCompatibleWithContentType(file, ct)) {
    responseBodyFileError.value = `File "${file.name}" doesn't match Content-Type ${ct}. Pick a file matching that type or change the Content-Type header.`
    return
  }

  const reader = new FileReader()
  reader.onerror = () => {
    responseBodyFileError.value = 'Failed to read file. Try a different file.'
  }
  // onloadend fires after onload OR onerror, so the spinner clears on every
  // outcome — including the early-return validation failures inside onload.
  reader.onloadend = () => {
    responseBodyFileLoading.value = false
  }
  reader.onload = () => {
    const result = reader.result
    if (typeof result !== 'string') {
      responseBodyFileError.value = 'Unexpected file reader result.'
      return
    }
    // Snapshot existing body before we overwrite, so we can roll back
    // when the contents fail format validation.
    const prevBody = responseBody.value
    if (responseBodyFormat.value === 'base64') {
      // Data URLs are `data:<mime>;base64,<payload>`. Slice off everything
      // up to the first comma to get the bare base64 payload WireMock
      // expects in `base64Body`.
      const commaIdx = result.indexOf(',')
      responseBody.value = commaIdx >= 0 ? result.slice(commaIdx + 1) : result
    } else if (responseBodyFormat.value === 'json') {
      if (!isValidJson(result)) {
        responseBody.value = prevBody
        responseBodyFileError.value = `File "${file.name}" is not valid JSON.`
        return
      }
      responseBody.value = result
    } else if (responseBodyFormat.value === 'xml') {
      if (!isValidXml(result)) {
        responseBody.value = prevBody
        responseBodyFileError.value = `File "${file.name}" is not valid XML.`
        return
      }
      responseBody.value = result
    } else {
      // Plain text — no parse validation.
      responseBody.value = result
    }
    uploadedFileName.value = file.name
    uploadedFileSize.value = file.size
  }

  responseBodyFileLoading.value = true
  if (responseBodyFormat.value === 'base64') {
    reader.readAsDataURL(file)
  } else {
    reader.readAsText(file)
  }
}

function clearUploadedFile(): void {
  responseBody.value = ''
  uploadedFileName.value = ''
  uploadedFileSize.value = 0
  responseBodyFileError.value = ''
}

// ── Body-pattern file upload (Request Matching → Body Patterns) ───
// Same affordance as the Response Body "Upload file" button, but applied
// per body-pattern row. Unlike the response body — whose format is driven
// by the Content-Type header — a body pattern's format is implied by its
// matcher kind: equalToJson → JSON, equalToXml → XML, binaryEqualTo →
// base64, equalTo/contains → free text. Only matchers whose value IS a
// body payload expose the button; expression/regex/datetime matchers
// don't (you can't upload a JSONPath expression from a file).
const BODY_PATTERN_UPLOAD_MATCHERS = new Set([
  'equalTo', 'contains', 'equalToJson', 'equalToXml', 'binaryEqualTo', 'matchesJsonSchema',
])

function bodyPatternSupportsUpload(matcherType: string): boolean {
  return BODY_PATTERN_UPLOAD_MATCHERS.has(matcherType)
}

function bodyPatternUploadFormat(matcherType: string): 'json' | 'xml' | 'base64' | 'text' {
  if (matcherType === 'equalToJson' || matcherType === 'matchesJsonSchema') return 'json'
  if (matcherType === 'equalToXml') return 'xml'
  if (matcherType === 'binaryEqualTo') return 'base64'
  return 'text'
}

// `accept` hint for the picker — narrows to the matcher's format where it
// helps, and stays permissive (`*/*`) for free-text / binary so the user
// can still pick anything.
function bodyPatternUploadAccept(matcherType: string): string {
  switch (bodyPatternUploadFormat(matcherType)) {
    case 'json': return 'application/json,.json'
    case 'xml':  return 'application/xml,text/xml,.xml,.svg'
    default:     return '*/*'
  }
}

function bodyPatternUploadFormatLabel(matcherType: string): string {
  switch (bodyPatternUploadFormat(matcherType)) {
    case 'json':   return 'JSON'
    case 'xml':    return 'XML'
    case 'base64': return 'Base64'
    default:       return 'Text'
  }
}

function handleBodyPatternFileUpload(ev: Event, row: BodyPatternRow): void {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  // Clear so the same file can be re-picked (change only fires on change).
  input.value = ''
  if (!file) return
  row.uploadFileError = ''

  const fmt = bodyPatternUploadFormat(row.matcherType)
  const reader = new FileReader()
  reader.onerror = () => {
    row.uploadFileError = 'Failed to read file. Try a different file.'
  }
  // Clears the spinner on every outcome (success or any onload early-return).
  reader.onloadend = () => {
    row.uploadFileLoading = false
  }
  reader.onload = () => {
    const result = reader.result
    if (typeof result !== 'string') {
      row.uploadFileError = 'Unexpected file reader result.'
      return
    }
    // Snapshot before overwrite so we can roll back on a format mismatch.
    const prev = row.value
    if (fmt === 'base64') {
      // Strip the `data:<mime>;base64,` prefix → bare base64 payload.
      const commaIdx = result.indexOf(',')
      row.value = commaIdx >= 0 ? result.slice(commaIdx + 1) : result
    } else if (fmt === 'json') {
      if (!isValidJson(result)) {
        row.value = prev
        row.uploadFileError = `File "${file.name}" is not valid JSON.`
        return
      }
      row.value = result
    } else if (fmt === 'xml') {
      if (!isValidXml(result)) {
        row.value = prev
        row.uploadFileError = `File "${file.name}" is not valid XML.`
        return
      }
      row.value = result
    } else {
      // Plain text — no parse validation.
      row.value = result
    }
    row.uploadedFileName = file.name
    row.uploadedFileSize = file.size
  }

  row.uploadFileLoading = true
  if (fmt === 'base64') {
    reader.readAsDataURL(file)
  } else {
    reader.readAsText(file)
  }
}

function clearBodyPatternFile(row: BodyPatternRow): void {
  row.value = ''
  row.uploadedFileName = undefined
  row.uploadedFileSize = undefined
  row.uploadFileError = ''
}

// Byte counts for the uploaded-file echo line — lib formatter.
const formatFileSize = fmtBytes
// True when the delay's uniform range is inverted. Drives live inline
// feedback beside the lower/upper inputs; submit-time validation in
// handleSubmit() uses the same condition as its source of truth.
const delayRangeInvalid = computed(() => {
  if (!enableDelay.value || delayType.value !== 'uniform') return false
  const lo = delayLower.value
  const hi = delayUpper.value
  return typeof lo === 'number' && typeof hi === 'number' && lo > hi
})

const urlValidationError = computed(() => {
  const trimmed = urlValue.value.trim()
  if (!trimmed || trimmed === '/') return ''
  if (!isValidUrlPath(trimmed)) {
    if (urlMatchType.value === 'urlPattern' || urlMatchType.value === 'urlPathPattern') {
      return 'Invalid URL pattern. Must start with / and contain no spaces.'
    }
    return 'Invalid URL path. Only letters, digits, /, -, _, ., ~, and standard URL characters are allowed.'
  }
  return ''
})

// (The local `isValidAbsoluteUrl` alias lived here for the inline
// proxy + webhook URL checks; both sections were extracted into
// `mock-form/ProxyingSection.vue` and `WebhooksSection.vue`, which
// import the shared validator directly.)



// ── Live validation — full report ─────────────────────────────
// Single source of truth for form-level validation. The right-side sticky
// panel renders this live so the user always sees every outstanding issue;
// handleSubmit() short-circuits when this list is non-empty. Issues are
// grouped by the section they belong to so the user knows where to look.
//
// Section validators that operate on plain inputs (Basic Auth, Webhook
// URL, Proxy URL, Chunked Dribble, Uniform Delay, Cookie Domain/Path)
// live in `../composables/useMockValidation.ts` and are called below.
// Sections still entangled with in-component helpers (metadata,
// request matching, body patterns, etc.) remain inline.

const validationIssues = computed<ValidationIssue[]>(() => {
  const issues: ValidationIssue[] = []

  // General
  if (!mockName.value.trim()) issues.push({ section: 'General', message: 'Mock name is required.' })
  if (!internalProjectId.value.trim()) issues.push({ section: 'General', message: 'Project ID is required.' })
  // Backend collision check — `nameExists` is set true by the
  // existence-check fetch when another mock under the same project
  // already uses this name. Surface it in the validation table so the
  // user can't submit past it.
  if (nameExists.value) {
    issues.push({
      section: 'General',
      message: `A mock named "${mockName.value.trim()}" already exists in this project.`,
    })
  }

  // Metadata — key syntax + value required when key provided
  const invalidKeys = metadataRows.value
    .filter(isMetadataKeyInvalid)
    .map(r => (r.key ?? '').trim())
    .filter(Boolean)
  if (invalidKeys.length > 0) {
    issues.push({
      section: 'Metadata',
      message: `Keys cannot contain whitespace${invalidKeys.length ? ` (check: ${invalidKeys.join(', ')})` : ''}.`,
    })
  }
  const metaMissingValue = metadataRows.value
    .filter(isMetadataValueMissing)
    .map(r => (r.key ?? '').trim())
    .filter(Boolean)
  if (metaMissingValue.length > 0) {
    issues.push({
      section: 'Metadata',
      message: `Each key needs a value (missing for ${metaMissingValue.join(', ')}).`,
    })
  }
  // JSON-typed metadata values must parse. (Text-typed values are free-form.)
  const badJsonValues = metadataRows.value
    .filter(r => !r.locked && r.valueType === 'json' && r.value.trim() && !isValidJson(r.value))
    .map(r => (r.key ?? '').trim() || '(unnamed)')
  if (badJsonValues.length > 0) {
    issues.push({
      section: 'Metadata',
      message: `JSON value is not valid JSON (check: ${badJsonValues.join(', ')}).`,
    })
  }
  // Metadata keys must be unique — duplicates collide into one entry.
  if (duplicateMetadataKeys.value.size > 0) {
    const dupes = [...duplicateMetadataKeys.value]
    issues.push({
      section: 'Metadata',
      message: `Duplicate metadata key${dupes.length === 1 ? '' : 's'} not allowed: ${dupes.join(', ')}. Use one row per key.`,
    })
  }

  // Request Matching — URL
  if (!urlValue.value.trim() || urlValue.value.trim() === '/') {
    issues.push({ section: 'Request Matching', message: 'URL is required.' })
  } else if (!isValidUrlPath(urlValue.value)) {
    issues.push({
      section: 'Request Matching',
      message: urlValidationError.value || 'Invalid URL path.',
    })
  }
  // Note: duplicate URLs are allowed by design — WireMock supports
  // multiple stubs at the same URL (priority-stacked, scenario-state
  // variants, etc.). `urlExists` only drives an inline warning; it does
  // NOT block submission.

  // Response Definition — body format must match Content-Type. Fault &
  // proxy bypass the canned response, so don't block saves over bodies
  // the server will never send.
  if (
    !enableFault.value
    && !enableProxy.value
    && responseBodyFormatError.value
  ) {
    issues.push({ section: 'Response Definition', message: responseBodyFormatError.value })
  }

  // Basic Auth — see useMockValidation.validateBasicAuth.
  issues.push(...validateBasicAuth({
    enabled: enableBasicAuth.value,
    username: basicAuthUsername.value,
    password: basicAuthPassword.value,
  }))

  // Key/value consistency across every "name → value" list. Rules:
  // - If the user filled a key they must supply a value.
  // - `absent` matchers are the exception (by definition they carry no value).
  // Skip the query-parameter rows when the section is disabled by the
  // current URL Match mode (url / urlPattern — the full-URL modes) —
  // those rows are visually inert in the form and won't be submitted, so
  // they shouldn't trigger validation errors either.
  const keyValueSections: Array<[string, string, Array<{ key?: string; value?: string; matcherType?: string }>]> = [
    ...(isQueryParamsDisabled.value ? [] : [['Request Matching', 'query parameter', queryParams.value] as [string, string, Array<{ key?: string; value?: string; matcherType?: string }>]]),
    ['Request Matching', 'header', requestHeaders.value],
    ['Response Definition', 'header', responseHeaders.value],
    ['Proxying', 'proxy header', additionalProxyHeaders.value],
    ['Webhooks', 'header', webhookHeaders.value],
  ]
  for (const [section, noun, rows] of keyValueSections) {
    const missingValue = rows.filter(isMatcherRowValueMissing)
    if (missingValue.length > 0) {
      const names = missingValue.map(r => (r.key ?? '').trim()).filter(Boolean).join(', ')
      issues.push({
        section,
        message: `Each ${noun} with a name also needs a value${names ? ` (missing for ${names})` : ''}.`,
      })
    }
    const missingKey = rows.filter(isMatcherRowKeyMissing)
    if (missingKey.length > 0) {
      issues.push({
        section,
        message: `Each ${noun} with a value also needs a name (${missingKey.length} row${missingKey.length === 1 ? '' : 's'} missing a name).`,
      })
    }
  }

  // Cookies — a named cookie must carry a value. Request cookies with the
  // `absent` matcher are an exception (they intentionally assert *no* value),
  // which is what `isMatcherRowValueMissing` already handles via matcherType.
  // For response cookies the default matcherType is `equalTo`, so this rule
  // enforces "if you typed a name, type a value too".
  const missingCookieValues = cookies.value.filter(isMatcherRowValueMissing)
  if (missingCookieValues.length > 0) {
    const names = missingCookieValues.map(c => cookieStr(c.key)).filter(Boolean).join(', ')
    issues.push({
      section: 'Cookies',
      message: `Each cookie with a name also needs a value${names ? ` (missing for ${names})` : ''}.`,
    })
  }
  // Mirror rule in the other direction: a value-without-key cookie has
  // nothing to bind to. Only meaningful for non-absent matchers (which is
  // already filtered inside isMatcherRowKeyMissing).
  const missingCookieKeys = cookies.value.filter(isMatcherRowKeyMissing)
  if (missingCookieKeys.length > 0) {
    issues.push({
      section: 'Cookies',
      message: `Each cookie with a value also needs a name (${missingCookieKeys.length} row${missingCookieKeys.length === 1 ? '' : 's'} missing a name).`,
    })
  }
  // Cookies — Domain / Path shape checks. See useMockValidation.validateCookieAttributes.
  issues.push(...validateCookieAttributes(cookies.value))

  // Body-pattern combination sanity checks.
  for (const issue of bodyPatternIssues.value) {
    issues.push({ section: 'Request Matching', message: `Body patterns — ${issue}` })
  }

  // Response headers — names must be unique (case-insensitive). The
  // wire payload is a JSON object keyed by header name, so two rows
  // sharing the same name would silently collide (later wins) or be
  // coerced into a multi-value array. For mock-response shapes the
  // single-name model is what users actually want: e.g. you can't have
  // two Content-Type headers, and Set-Cookie is owned by the dedicated
  // Cookies section. Block duplicates with a clear message instead of
  // silently coalescing.
  {
    const seen = new Map<string, number>() // canonical name -> count
    for (const h of responseHeaders.value) {
      const name = (h.key ?? '').trim()
      if (!name) continue
      const canonical = name.toLowerCase()
      seen.set(canonical, (seen.get(canonical) ?? 0) + 1)
    }
    const dupes = Array.from(seen.entries()).filter(([, n]) => n > 1).map(([k]) => k)
    if (dupes.length > 0) {
      issues.push({
        section: 'Response Definition',
        message: `Duplicate response header${dupes.length === 1 ? '' : 's'} not allowed: ${dupes.join(', ')}. Use one row per header name (Set-Cookie is handled in the Cookies section).`,
      })
    }
  }

  // Request headers — names must be unique (case-insensitive), same
  // rationale as response headers: the wire payload keys matchers by
  // header name, so two rows sharing a name silently collide.
  if (duplicateRequestHeaderKeys.value.size > 0) {
    const dupes = [...duplicateRequestHeaderKeys.value]
    issues.push({
      section: 'Request Matching',
      message: `Duplicate request header${dupes.length === 1 ? '' : 's'} not allowed: ${dupes.join(', ')}. Use one row per header name.`,
    })
  }

  // Webhook URL — see useMockValidation.validateWebhookUrl.
  issues.push(...validateWebhookUrl({
    enabled: enableWebhook.value,
    url: webhookUrl.value,
  }))

  // Proxy base URL — see useMockValidation.validateProxyUrl.
  issues.push(...validateProxyUrl({
    enabled: enableProxy.value,
    url: proxyBaseUrl.value,
  }))

  // Chunked Dribble — see useMockValidation.validateChunkedDribble.
  // (Bypassed when fault is on — WireMock ignores delays then.)
  issues.push(...validateChunkedDribble({
    faultEnabled: enableFault.value,
    dribbleEnabled: enableChunkedDribble.value,
    numberOfChunks: chunkedNumberOfChunks.value,
    totalDuration: chunkedTotalDuration.value,
  }))

  // Uniform delay — see useMockValidation.validateUniformDelay.
  issues.push(...validateUniformDelay({
    faultEnabled: enableFault.value,
    delayEnabled: enableDelay.value,
    delayType: delayType.value,
    lower: delayLower.value,
    upper: delayUpper.value,
  }))

  return issues
})

// Grouped view for the sticky side panel — `[section, [message, ...]]`
// pairs in their original order of appearance so the panel reads top-down
// in the same order as the form sections.
const validationIssuesBySection = computed<Array<[string, string[]]>>(() => {
  const groups = new Map<string, string[]>()
  for (const { section, message } of validationIssues.value) {
    if (!groups.has(section)) groups.set(section, [])
    groups.get(section)!.push(message)
  }
  return Array.from(groups.entries())
})

// ── Build matcher object from a MatcherRow ────────────────────
function buildMatcherObject(row: MatcherRow): Record<string, any> {
  if (row.matcherType === 'absent') return { absent: true }
  const obj: Record<string, any> = { [row.matcherType]: row.value }
  // Only emit `caseInsensitive` when both the user opted in AND the
  // matcher kind actually honours it. WireMock silently ignores the
  // flag on date/JSON/XML/binary matchers, but emitting it would still
  // pollute the wire payload, so suppress it here.
  if (row.caseInsensitive && supportsCaseInsensitive(row.matcherType)) {
    obj.caseInsensitive = true
  }
  return obj
}

// ── Build body pattern object ─────────────────────────────────
function buildBodyPatternObject(row: BodyPatternRow): Record<string, any> {
  if (row.matcherType === 'absent') return { absent: true }
  const obj: Record<string, any> = {}
  if (row.matcherType === 'equalToJson') {
    try {
      obj.equalToJson = JSON.parse(row.value)
    } catch {
      obj.equalToJson = row.value
    }
    if (row.ignoreArrayOrder) obj.ignoreArrayOrder = true
    if (row.ignoreExtraElements) obj.ignoreExtraElements = true
  } else if (
    row.matcherType === 'matchesJsonPath'
    && (
      (row.varyBy ?? '').trim()
      || ((row.jsonPathSubMatcher ?? '').trim() && row.jsonPathSubMatcher !== '')
    )
  ) {
    // JSONPath in the object form — used when the user pairs the
    // expression with a sub-matcher (`equalTo`, `contains`, `matches`,
    // etc. applied to the extracted value) or with `vary-by` for
    // templated stubs that need to vary by a sub-expression. WireMock
    // expects the hyphenated `vary-by` on the wire, which is what its
    // docs and tests use. Bare-expression JSONPath stays as a plain
    // string a few branches below.
    const sub: Record<string, unknown> = { expression: row.value }
    if ((row.varyBy ?? '').trim()) {
      sub['vary-by'] = row.varyBy!.trim()
    }
    const subKind = row.jsonPathSubMatcher ?? ''
    if (subKind) {
      if (subKind === 'absent') {
        sub.absent = true
      } else if (subKind === 'equalToJson') {
        // Try to parse so the schema/document goes out as a real JSON
        // object — fall back to the raw string for partial edits.
        const raw = row.jsonPathSubMatcherValue ?? ''
        try {
          sub.equalToJson = JSON.parse(raw)
        } catch {
          sub.equalToJson = raw
        }
      } else {
        sub[subKind] = row.jsonPathSubMatcherValue ?? ''
      }
    }
    obj.matchesJsonPath = sub
  } else if (row.matcherType === 'matchesJsonSchema') {
    // JSON Schema body pattern. Try to parse the value as JSON so the
    // schema goes out as a real object — fall back to the raw string for
    // partial / in-progress edits (still valid per WireMock).
    try {
      obj.matchesJsonSchema = JSON.parse(row.value)
    } catch {
      obj.matchesJsonSchema = row.value
    }
    if ((row.schemaVersion ?? '').trim()) obj.schemaVersion = row.schemaVersion
  } else if (row.matcherType === 'matchesXPath') {
    // XPath always serialises as a bare expression string. Namespaces,
    // when present, ride alongside as a sibling `xPathNamespaces` map —
    // same shape WireMock's docs use:
    //   { "matchesXPath": "/users/user[@id='1']",
    //     "xPathNamespaces": { "ns": "http://example.com/ns" } }
    obj.matchesXPath = row.value
    const ns = (row.xPathNamespaces ?? []).filter(n => n.prefix.trim() && n.uri.trim())
    if (ns.length > 0) {
      obj.xPathNamespaces = Object.fromEntries(ns.map(n => [n.prefix.trim(), n.uri.trim()]))
    }
  } else if (row.matcherType === 'equalToXml') {
    obj.equalToXml = row.value
    if (row.enablePlaceholders) obj.enablePlaceholders = true
    const ns = (row.xPathNamespaces ?? []).filter(n => n.prefix.trim() && n.uri.trim())
    if (ns.length > 0) {
      obj.xPathNamespaces = Object.fromEntries(ns.map(n => [n.prefix.trim(), n.uri.trim()]))
    }
  } else {
    obj[row.matcherType] = row.value
  }
  // DateTime truncation / offset options only apply to the date matchers.
  if (DATETIME_BODY_MATCHERS.has(row.matcherType)) {
    if ((row.truncateExpected ?? '').trim()) obj.truncateExpected = row.truncateExpected
    if ((row.truncateActual ?? '').trim()) obj.truncateActual = row.truncateActual
    if (typeof row.expectedOffset === 'number' && Number.isFinite(row.expectedOffset)) {
      obj.expectedOffset = row.expectedOffset
      if ((row.expectedOffsetUnit ?? '').trim()) obj.expectedOffsetUnit = row.expectedOffsetUnit
    }
  }
  return obj
}

// ── Build payload ─────────────────────────────────────────────
function buildRequest(): RequestDefinition {
  const payloadUrlKey = urlMatchType.value
  // Prepend the project namespace so every mock under "Acme Project" is
  // served under /acme-project/... See `projectUrlPrefix`. The user-typed
  // portion is guaranteed to start with `/`, so the joined path can never
  // produce a `//` boundary.
  const path = urlValue.value.startsWith('/') ? urlValue.value : `/${urlValue.value}`
  const fullPath = projectUrlPrefix.value + path
  const req: Record<string, unknown> = {
    method: httpMethod.value,
    [payloadUrlKey]: fullPath,
  }

  // Headers
  // We start with whatever the user typed in the Headers grid, then let the
  // base64-mode basic-auth block (further down) splice in `Authorization`.
  // If the user happened to also add an `Authorization` header by hand, the
  // base64 mode wins — having two competing matchers on the same header is
  // a stub schema violation, and the explicit basic-auth section is the
  // clearer source of truth.
  const filteredHeaders = requestHeaders.value.filter(h => h.key.trim())
  if (filteredHeaders.length > 0) {
    req.headers = Object.fromEntries(filteredHeaders.map(h => [h.key, buildMatcherObject(h)]))
  }

  // Request cookies — every CookieRow with direction='request' becomes a
  // matcher against the incoming Cookie header. Browsers only transmit
  // `name=value` pairs in that header, so attributes like Domain/Path/etc.
  // are ignored here even if the row has them set.
  // Rules:
  //   • Skip rows with no key (blank/in-progress entries).
  //   • For non-absent matchers, also skip rows with an empty value —
  //     matching `{}` or `{ equalTo: '' }` is rarely what the user wants
  //     and we already treat empty like that elsewhere.
  //   • If two rows target the same name, last one wins (Object key
  //     collision is unavoidable with WireMock's map-shaped schema).
  const requestCookies = cookies.value.filter(c =>
    c.direction === 'request'
    && cookieStr(c.key)
    && (c.matcherType === 'absent' || cookieStr(c.value)),
  )
  if (requestCookies.length > 0) {
    req.cookies = Object.fromEntries(
      requestCookies.map(c => [cookieStr(c.key), buildMatcherObject({
        key: cookieStr(c.key),
        matcherType: c.matcherType,
        value: cookieStr(c.value),
        caseInsensitive: c.caseInsensitive === true,
      })]),
    )
  }

  // Query parameters — skipped entirely when URL Match is a full-URL
  // mode (`url` / `urlPattern`), which already match the query string as
  // part of the URL. The form disables the controls in those modes so the
  // user can see any pre-existing rows, but we don't ship them in the
  // payload: combining them with `url`/`urlPattern` is almost always a
  // bug (the URL match fails once a query string is present).
  if (!isQueryParamsDisabled.value) {
    const filteredParams = queryParams.value.filter(q => q.key.trim())
    if (filteredParams.length > 0) {
      req.queryParameters = Object.fromEntries(filteredParams.map(q => [q.key, buildMatcherObject(q)]))
    }
  }

  // Body patterns
  const filteredBody = bodyPatterns.value.filter(b => b.matcherType === 'absent' || b.value.trim())
  if (filteredBody.length > 0) {
    req.bodyPatterns = filteredBody.map(buildBodyPatternObject)
  }

  // Basic auth
  // Two emit shapes corresponding to the two UI modes:
  //   plain  → request.basicAuthCredentials = { username, password }
  //   base64 → request.headers.Authorization = { equalTo: 'Basic <b64>' }
  // For the base64 case we merge into the headers map (creating it if the
  // user hadn't added any other headers), and override any Authorization
  // matcher the user might have typed in by hand — see header note above.
  if (enableBasicAuth.value && basicAuthUsername.value.trim() && basicAuthPassword.value.trim()) {
    if (basicAuthMode.value === 'base64') {
      const encoded = encodeBasicAuth(basicAuthUsername.value, basicAuthPassword.value)
      // Strip any case-variant of the Authorization key the user added so we
      // don't end up with both "Authorization" and "authorization" entries.
      const headers: Record<string, unknown> = {}
      const existing = (req.headers as Record<string, unknown> | undefined) ?? {}
      for (const [k, v] of Object.entries(existing)) {
        if (k.toLowerCase() !== 'authorization') headers[k] = v
      }
      headers.Authorization = { equalTo: `Basic ${encoded}` }
      req.headers = headers
    } else {
      req.basicAuthCredentials = {
        username: basicAuthUsername.value,
        password: basicAuthPassword.value,
      }
    }
  }

  return req as unknown as RequestDefinition
}

function buildResponse(): ResponseDefinition {
  const res: Record<string, unknown> = {
    status: responseStatus.value,
  }

  // When fault simulation is on, WireMock discards the rest of the response
  // and emits the fault instead. Ship only `status` (schema requirement) +
  // `fault`, omitting headers/body/delays/chunked so we don't persist dead
  // data that would reappear if the user ever disables the fault later.
  if (enableFault.value) {
    res.fault = faultType.value
    return res as unknown as ResponseDefinition
  }

  // Proxying overrides status/message/headers/body (those come from the
  // upstream response), but delays and chunked-dribble still apply on the
  // proxied response, so we fall through to emit those below.
  if (!enableProxy.value) {
    // Only emit `statusMessage` when the user actually overrode the
    // canonical phrase. Sending it unconditionally would persist the
    // stock phrase ("OK", "Created", …) into the stub, which is just
    // noise on the wire and makes diffs across stubs look meaningful
    // when they aren't.
    if (isStatusMessageOverridden.value && responseStatusMessage.value.trim()) {
      res.statusMessage = responseStatusMessage.value
    }

    // Headers — build the map, then inject Set-Cookie from the Cookies
    // section so it wins over any Set-Cookie the user typed into the
    // headers grid by hand. When there's more than one cookie we emit the
    // header value as a string[] (WireMock's multi-value form); browsers
    // can't parse a comma-joined Set-Cookie because cookie Expires legally
    // contains commas.
    //
    // Regular headers are one row = one (key, value) pair. If the user
    // adds the same key twice we coalesce them into a string[] on the
    // wire so neither value is silently dropped.
    const filteredHeaders = responseHeaders.value.filter(h => h.key.trim())
    const headerMap: Record<string, string | string[]> = {}
    for (const h of filteredHeaders) {
      // Drop any Set-Cookie the user typed in — the dedicated Cookies
      // section is the single source of truth for this header.
      if (h.key.trim().toLowerCase() === 'set-cookie') continue
      const existing = headerMap[h.key]
      if (existing === undefined) {
        headerMap[h.key] = h.value
      } else if (Array.isArray(existing)) {
        existing.push(h.value)
      } else {
        headerMap[h.key] = [existing, h.value]
      }
    }
    // Only response-direction rows become Set-Cookie headers. Request-side
    // rows went out via `request.cookies` in buildRequest.
    const setCookieValues = cookies.value
      .filter(c => c.direction === 'response')
      .map(cookieToSetCookieString)
      .filter(Boolean)
    if (setCookieValues.length === 1) {
      headerMap['Set-Cookie'] = setCookieValues[0]
    } else if (setCookieValues.length > 1) {
      headerMap['Set-Cookie'] = setCookieValues
    }
    if (Object.keys(headerMap).length > 0) {
      res.headers = headerMap
    }

    // Body — the on-wire shape is picked by the Content-Type (see
    // `responseBodyFormat`), not a user toggle.
    if (responseBody.value.trim()) {
      if (responseBodyFormat.value === 'json') {
        // If the user's JSON is actually valid, emit it as `jsonBody`
        // so WireMock can reflect the parsed structure in templates /
        // equalToJson checks. When it isn't valid we fall back to
        // `body` so the mock still saves — the form already surfaces
        // the parse error, so the user knows what to fix.
        try {
          res.jsonBody = JSON.parse(responseBody.value)
        } catch {
          res.body = responseBody.value
        }
      } else if (responseBodyFormat.value === 'base64') {
        res.base64Body = responseBody.value
      } else {
        // Covers both 'xml' and 'text' — WireMock has no dedicated xml
        // body field, so XML is persisted as literal text.
        res.body = responseBody.value
      }
    }
  }

  // Delay
  if (enableDelay.value) {
    if (delayType.value === 'uniform') {
      res.delayDistribution = { type: 'uniform', lower: delayLower.value, upper: delayUpper.value }
    } else if (delayType.value === 'lognormal') {
      res.delayDistribution = { type: 'lognormal', median: delayMedian.value, sigma: delaySigma.value }
    } else if (delayType.value === 'fixed') {
      res.fixedDelayMilliseconds = delayFixed.value
    }
  }

  // Chunked dribble delay
  if (enableChunkedDribble.value) {
    res.chunkedDribbleDelay = {
      numberOfChunks: chunkedNumberOfChunks.value,
      totalDuration: chunkedTotalDuration.value,
    }
  }

  // Proxying
  if (enableProxy.value && proxyBaseUrl.value.trim()) {
    res.proxyBaseUrl = proxyBaseUrl.value
    const proxyHeaders = additionalProxyHeaders.value.filter(h => h.key.trim())
    if (proxyHeaders.length > 0) {
      res.additionalProxyRequestHeaders = Object.fromEntries(proxyHeaders.map(h => [h.key, h.value]))
    }
    if (removeProxyHeaders.value.length > 0) {
      res.removeProxyRequestHeaders = [...removeProxyHeaders.value]
    }
  }

  return res as unknown as ResponseDefinition
}

// ── Submit ────────────────────────────────────────────────────
async function handleSubmit() {
  submitAttempted.value = true
  // Validation is derived live in `validationIssues`; just short-circuit
  // here if anything is outstanding. The sticky right-side report already
  // shows the user exactly what needs attention.
  if (validationIssues.value.length > 0) return

  isSubmitting.value = true
  try {
    const payload: CreateMockPayload = {
      name: mockName.value.trim(),
      description: description.value.trim() || undefined,
      projectId: internalProjectId.value.trim(),
      request: buildRequest(),
      response: buildResponse(),
      persistent: persistent.value,
    }

    // Optional top-level props
    // Coerce priority to a real number before sending. `v-model.number` on an
    // <input type="number"> can yield an empty string when the user clears the
    // field, which would otherwise pass `!== undefined && !== null` and ship a
    // non-numeric value to the backend. `Number.isFinite(Number(...))` rejects
    // undefined, null, '', and NaN in a single check.
    const priorityNum = Number(priority.value)
    if (Number.isFinite(priorityNum)) {
      payload.priority = priorityNum
    }

    // Top-level optional fields. We only ship them when the user has
    // actually set them — sending empty strings would persist meaningless
    // values into the stub mapping (and confuse anyone reading the JSON).
    if (metadataRows.value.length > 0) {
      const filteredMeta = metadataRows.value.filter(r => r.key.trim())
      if (filteredMeta.length > 0) {
        payload.metadata = Object.fromEntries(filteredMeta.map(r => {
          try { return [r.key, JSON.parse(r.value)] } catch { return [r.key, r.value] }
        }))
      }
    }

    // Note: browser cookie attributes (Domain, Path, Expires, Max-Age,
    // Secure, HttpOnly, SameSite) round-trip inside the Set-Cookie header
    // value itself — no metadata sidecar is needed.

    // Webhooks
    // Emitted in the WireMock 3.1.0+ `serveEventListeners` shape:
    // a top-level array of {name, parameters} entries. The listener's
    // `name` is the literal string "webhook" (the extension id WireMock
    // looks up), and all webhook config (method/url/headers/body/delay)
    // lives inside `parameters`. The legacy `postServeActions` map is no
    // longer produced — existing mocks in that shape still load via
    // `populateFromMock`, and are rewritten on next save.
    if (enableWebhook.value && webhookUrl.value.trim()) {
      const parameters: Record<string, unknown> = {
        method: webhookMethod.value,
        url: webhookUrl.value,
      }
      const whHeaders = webhookHeaders.value.filter(h => h.key.trim())
      if (whHeaders.length > 0) {
        parameters.headers = Object.fromEntries(whHeaders.map(h => [h.key, h.value]))
      }
      if (webhookBody.value.trim()) parameters.body = webhookBody.value
      if (webhookDelayMs.value > 0) parameters.delay = { type: 'fixed', milliseconds: webhookDelayMs.value }
      payload.serveEventListeners = [{ name: 'webhook', parameters }]
    }

    // Ship the same cURL the user sees in the "Test with cURL" panel so the
    // backend can persist it alongside the mock. For pattern-based URL
    // matchers (urlPattern / urlPathPattern) the cURL is a best-effort
    // sample synthesised from the regex (see resolveRegexToSample) —
    // sending it is still useful because it gives consumers a runnable
    // starting point they can adapt, instead of nothing at all.
    const curlToSend = curlCommand.value.trim()
    if (curlToSend) {
      payload.curl = curlToSend
    }

    if (isEditMode.value && props.mock) {
      const result = await mockApi.update(props.mock.id, payload)
      showToastMessage(`Mock "${result.name}" updated successfully!`, BaseToastEnum.SUCCESS, 4000)
      emit('updated', result.id)
    } else {
      const result = await mockApi.create(payload)
      showToastMessage(`Mock "${result.name}" created successfully!`, BaseToastEnum.SUCCESS, 4000)
      emit('created', result.id)
      resetForm()
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : `Failed to ${isEditMode.value ? 'update' : 'create'} mock.`
    showToastMessage(msg, BaseToastEnum.ERROR, 5000)
  } finally {
    isSubmitting.value = false
  }
}

function resetForm() {
  mockName.value = ''
  description.value = ''
  urlValue.value = '/'
  // Re-seed priority to the WireMock default so the next mock starts from a
  // known baseline rather than an empty field.
  priority.value = 5
  // Metadata — preserve locked rows (e.g. project)
  metadataRows.value = metadataRows.value.filter(r => r.locked)
  // Request
  requestHeaders.value = []
  queryParams.value = []
  bodyPatterns.value = []
  cookies.value = []
  enableBasicAuth.value = false
  basicAuthUsername.value = ''
  basicAuthPassword.value = ''
  basicAuthMode.value = 'plain'
  // Response
  responseStatus.value = 200
  // Drop any user override of the status reason phrase so the field
  // tracks the canonical phrase ("OK") for the reset 200 status.
  responseStatusMessageOverride.value = null
  responseHeaders.value = [{ key: 'Content-Type', value: 'application/json' }]
  responseBody.value = ''
  uploadedFileName.value = ''
  uploadedFileSize.value = 0
  responseBodyFileError.value = ''
  enableDelay.value = false
  enableChunkedDribble.value = false
  enableFault.value = false
  enableProxy.value = false
  proxyBaseUrl.value = ''
  additionalProxyHeaders.value = []
  removeProxyHeaders.value = []
  clearWebhookFields()
  enableWebhook.value = false
  // Collapse all
  Object.keys(collapsedSections.value).forEach(k => collapsedSections.value[k] = true)
  submitAttempted.value = false
}

// ── cURL builder ─────────────────────────────────────────────
// Follows the conventions outlined in
// https://medium.com/@MissAmaraKay/what-is-curl-and-why-is-it-all-over-api-docs-b141c33805e0
//   - Start simple: base URL + path, explicit method
//   - Always include an explicit -X <METHOD>
//   - Quote the URL for cross-platform safety
//   - One -H per header, one -d for body
//   - Never emit placeholder brackets — values are shell-escaped literally
const curlCopied = ref(false)

// Shell-escape a value so it is safe inside a single-quoted string.
// Any literal ' becomes '\'' (close quote, escaped quote, reopen quote).
function shEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

// Best-effort resolver: walks a Java/PCRE-style regex and produces one
// concrete sample string that matches it. This lets us still generate a
// useful cURL preview when the URL Match mode is `urlPattern` or
// `urlPathPattern`, so the user can copy/paste-and-edit instead of
// being left with no preview at all.
//
// It is intentionally heuristic, not a full regex engine:
//   - Anchors (^ $) are stripped.
//   - Common escape classes get a representative char (\d → '1',
//     \w → 'a', \s → ' ', \. → '.', etc.).
//   - Character classes pick their first usable character (handling
//     simple ranges like [a-z]).
//   - Groups (...) are descended into; alternation picks the first
//     branch.
//   - Quantifiers {n}/{n,m}/+ /* /? expand to a small number of
//     repetitions (1 by default, n for explicit counts, 0 for `*`/`?`
//     when nothing better fits).
//   - `.` becomes 'x'.
// Anything we can't classify is appended verbatim. The output is not
// guaranteed to match the regex — it's a starting point the user can
// tweak.
function resolveRegexToSample(pattern: string): string {
  let p = pattern
  // Drop anchors — they don't contribute to the sample string.
  if (p.startsWith('^')) p = p.slice(1)
  if (p.endsWith('$') && !p.endsWith('\\$')) p = p.slice(0, -1)

  let out = ''
  let i = 0

  // Returns { count, len } describing the quantifier (if any) that
  // starts at position `pos`. `count` is the number of repetitions to
  // emit, `len` is how many characters of input the quantifier consumes.
  function readQuantifier(pos: number): { count: number; len: number } {
    if (pos >= p.length) return { count: 1, len: 0 }
    const ch = p[pos]
    if (ch === '+') return { count: 1, len: 1 }
    if (ch === '*') return { count: 0, len: 1 }
    if (ch === '?') return { count: 1, len: 1 }
    if (ch === '{') {
      const end = p.indexOf('}', pos)
      if (end > pos) {
        const body = p.slice(pos + 1, end)
        const n = parseInt(body.split(',')[0], 10)
        if (!isNaN(n)) return { count: Math.max(1, n), len: end - pos + 1 }
      }
    }
    return { count: 1, len: 0 }
  }

  // Find the index of the `)` that closes the `(` at position `start`.
  function findMatchingParen(start: number): number {
    let depth = 0
    for (let k = start; k < p.length; k++) {
      const ch = p[k]
      if (ch === '\\') { k++; continue }
      if (ch === '(') depth++
      else if (ch === ')') { depth--; if (depth === 0) return k }
    }
    return -1
  }

  // Index of the first top-level `|` inside `s`, or -1.
  function topLevelAltIdx(s: string): number {
    let depth = 0
    for (let k = 0; k < s.length; k++) {
      const ch = s[k]
      if (ch === '\\') { k++; continue }
      if (ch === '(' || ch === '[') depth++
      else if (ch === ')' || ch === ']') depth--
      else if (ch === '|' && depth === 0) return k
    }
    return -1
  }

  while (i < p.length) {
    const c = p[i]

    // Escape sequences.
    if (c === '\\' && i + 1 < p.length) {
      const next = p[i + 1]
      let token = ''
      switch (next) {
        case 'd': token = '1'; break
        case 'D': token = 'a'; break
        case 'w': token = 'a'; break
        case 'W': token = '-'; break
        case 's': token = ' '; break
        case 'S': token = 'x'; break
        case 'n': token = ''; break
        case 't': token = ''; break
        case 'b': token = ''; break
        default: token = next // escaped literal: \. \/ \- \+ etc.
      }
      i += 2
      const q = readQuantifier(i)
      out += token.repeat(q.count)
      i += q.len
      continue
    }

    // Character class.
    if (c === '[') {
      const end = p.indexOf(']', i + 1)
      if (end === -1) { out += c; i++; continue }
      const body = p.slice(i + 1, end).replace(/^\^/, '')
      // Pick the first usable char (collapse ranges to their start).
      let sample = ''
      for (let k = 0; k < body.length; k++) {
        const ch = body[k]
        if (ch === '\\' && k + 1 < body.length) { sample = body[k + 1]; break }
        if (ch === '-' && k > 0 && k + 1 < body.length) continue
        sample = ch
        break
      }
      if (!sample) sample = 'x'
      i = end + 1
      const q = readQuantifier(i)
      out += sample.repeat(q.count)
      i += q.len
      continue
    }

    // Group.
    if (c === '(') {
      const end = findMatchingParen(i)
      if (end === -1) { out += c; i++; continue }
      let inner = p.slice(i + 1, end)
      // Strip non-capturing / lookaround prefixes.
      if (inner.startsWith('?:') || inner.startsWith('?=') || inner.startsWith('?!')) {
        if (inner.startsWith('?=') || inner.startsWith('?!')) {
          // Lookarounds don't consume input.
          i = end + 1
          continue
        }
        inner = inner.slice(2)
      }
      // Alternation — pick the first branch.
      const altIdx = topLevelAltIdx(inner)
      if (altIdx >= 0) inner = inner.slice(0, altIdx)
      const resolved = resolveRegexToSample(inner)
      i = end + 1
      const q = readQuantifier(i)
      out += resolved.repeat(q.count)
      i += q.len
      continue
    }

    // Wildcard.
    if (c === '.') {
      i++
      const q = readQuantifier(i)
      out += 'x'.repeat(q.count)
      i += q.len
      continue
    }

    // Top-level alternation — only the first branch remains.
    if (c === '|') break

    // Literal char with optional quantifier.
    i++
    const q = readQuantifier(i)
    out += c.repeat(q.count)
    i += q.len
  }

  return out
}

// When the URL Match mode is regex (`urlPattern` / `urlPathPattern`) we
// still want to give the user a runnable starting point — so we resolve
// the regex into one sample concrete URL and surface it both in the
// preview and (via `isCurlSynthesised`) as an inline note explaining
// the URL is best-effort and may need tweaking.
const isCurlSynthesised = computed(() =>
  urlMatchType.value === 'urlPattern' || urlMatchType.value === 'urlPathPattern'
)

const curlCommand = computed(() => {
  const url = urlValue.value.trim()
  if (!url) return ''

  const configuredMethod = httpMethod.value.toUpperCase()
  const base = WIREMOCK_BASE_URL.replace(/\/$/, '')

  // For regex modes, resolve the pattern into one sample concrete URL
  // the user can copy/paste-and-tweak. For exact modes, use the URL
  // value as-is. resolveRegexToSample is heuristic; we fall back to the
  // raw pattern if resolution produces an empty string.
  let resolvedUrl = url
  if (isCurlSynthesised.value) {
    const sample = resolveRegexToSample(url)
    resolvedUrl = sample.trim() || url
  }
  const userPath = resolvedUrl.startsWith('/') ? resolvedUrl : `/${resolvedUrl}`
  // Mirror the prefix that buildRequest() prepends so the cURL the user
  // copies actually hits the stub we register on WireMock.
  const path = projectUrlPrefix.value + userPath

  // Append query params (if any) to the path with proper encoding.
  // When URL Match is a full-URL mode (`url` / `urlPattern`), the Query
  // Parameters section is disabled and intentionally ignored at submit
  // time — mirror that here so the preview matches what WireMock will
  // actually receive. (In those modes any query string lives in the URL
  // field itself.)
  const filteredParams = isQueryParamsDisabled.value
    ? []
    : queryParams.value.filter(q => q.key.trim())
  let fullPath = path
  if (filteredParams.length > 0) {
    const qs = filteredParams
      .map(q => `${encodeURIComponent(q.key)}=${encodeURIComponent(q.value)}`)
      .join('&')
    fullPath += (fullPath.includes('?') ? '&' : '?') + qs
  }

  // Every body matcher except `absent` has a value that's worth surfacing
  // in the cURL preview. For literal kinds (equalTo / equalToJson /
  // equalToXml / binaryEqualTo) the value IS a concrete payload. For
  // shape kinds (contains / matches / doesNotMatch / matchesJsonPath /
  // matchesXPath) the value is the substring / regex / path expression
  // — not a guaranteed-matching body, but emitting it keeps the preview
  // reactive so the user can see their changes flow through and edit
  // the body manually if a stricter example is needed.
  const LITERAL_BODY_MATCHERS = new Set([
    'equalTo', 'contains',
    'equalToJson', 'matchesJsonPath',
    'equalToXml', 'matchesXPath',
    'binaryEqualTo',
  ])
  const literalBody = bodyPatterns.value.find(
    b => LITERAL_BODY_MATCHERS.has(b.matcherType) && b.value.trim(),
  )

  // `ANY` is a WireMock matcher, not a real HTTP verb — curl would reject it.
  // If the user wants any method, fall back to POST when a body is present,
  // otherwise GET.
  const method = configuredMethod === 'ANY'
    ? (literalBody ? 'POST' : 'GET')
    : configuredMethod

  const lines: string[] = []
  lines.push(`curl -X ${method} ${shEscape(`${base}${fullPath}`)}`)

  // Headers — one per line for readability.
  const filteredHeaders = requestHeaders.value.filter(h => h.key.trim())
  for (const h of filteredHeaders) {
    lines.push(`-H ${shEscape(`${h.key}: ${h.value}`)}`)
  }

  // Request-side cookies translate to a `-b 'name=value; ...'` flag because
  // that's what a browser actually puts into the outbound Cookie header.
  // We only include rows with an `equalTo` matcher and a non-empty value —
  // regex/contains/absent describe *what to match*, not a concrete value,
  // so they have no literal cURL representation. Response-side cookies
  // (direction='response') are emitted on the server reply via Set-Cookie
  // and are intentionally absent from the cURL preview.
  const literalRequestCookies = cookies.value.filter(
    c => c.direction === 'request'
      && c.matcherType === 'equalTo'
      && cookieStr(c.key)
      && cookieStr(c.value),
  )
  if (literalRequestCookies.length > 0) {
    const cookieHeader = literalRequestCookies
      .map(c => `${cookieStr(c.key)}=${cookieStr(c.value)}`)
      .join('; ')
    lines.push(`-b ${shEscape(cookieHeader)}`)
  }

  // Basic auth — shape mirrors the chosen UI mode so the preview always
  // matches what the stub will receive:
  //   plain  → `-u 'user:password'`  (curl encodes for you)
  //   base64 → `-H 'Authorization: Basic <b64>'`  (literal header, matches
  //            the exact value WireMock will compare against)
  if (enableBasicAuth.value && basicAuthUsername.value.trim()) {
    if (basicAuthMode.value === 'base64') {
      const encoded = encodeBasicAuth(basicAuthUsername.value, basicAuthPassword.value)
      lines.push(`-H ${shEscape(`Authorization: Basic ${encoded}`)}`)
    } else {
      lines.push(`-u ${shEscape(`${basicAuthUsername.value}:${basicAuthPassword.value}`)}`)
    }
  }

  // Body — emit for any method if the user has configured a literal-body matcher.
  // (WireMock accepts bodies on GET, so restricting by method would hide valid
  // test payloads from the preview.)
  if (literalBody) {
    const mt = literalBody.matcherType
    const isJsonPayload = mt === 'equalToJson' || mt === 'matchesJsonPath'
    const isXmlPayload = mt === 'equalToXml' || mt === 'matchesXPath'
    const hasContentType = filteredHeaders.some(h => h.key.toLowerCase() === 'content-type')
    if (!hasContentType) {
      const ct = isJsonPayload ? 'application/json'
        : isXmlPayload ? 'application/xml'
        : 'text/plain'
      lines.push(`-H ${shEscape(`Content-Type: ${ct}`)}`)
    }
    let bodyStr = literalBody.value.trim()
    // Pretty-print JSON bodies into a compact form. Skip for matchesJsonPath
    // because the value is a JSONPath expression, not parseable JSON.
    if (mt === 'equalToJson') {
      try { bodyStr = JSON.stringify(JSON.parse(bodyStr)) } catch { /* keep as-is if invalid JSON */ }
    }
    lines.push(`-d ${shEscape(bodyStr)}`)
  }

  return lines.join(' \\\n  ')
})

async function copyCurl() {
  try {
    await navigator.clipboard.writeText(curlCommand.value)
    curlCopied.value = true
    setTimeout(() => { curlCopied.value = false }, 2000)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = curlCommand.value
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    curlCopied.value = true
    setTimeout(() => { curlCopied.value = false }, 2000)
  }
}

// Reactive body-pattern issue computeds — one per list so the template can
// display each list's issues independently.
const bodyPatternIssues = computed(() => findBodyPatternIssues(bodyPatterns.value))

// Count of active features for badges.
// Only count user-added metadata rows (locked rows like `project` are automatic and
// do not represent a user-enabled advanced feature).
const activeAdvancedCount = computed(() => {
  let count = 0
  if (metadataRows.value.some(r => !r.locked && (r.key.trim() || r.value.trim()))) count++
  if (cookies.value.length > 0) count++
  if (enableBasicAuth.value) count++
  if (enableFault.value) count++
  if (enableProxy.value) count++
  if (enableWebhook.value) count++
  if (enableChunkedDribble.value) count++
  return count
})
</script>

<template>
  <div class="max-w-7xl mx-auto">
    <!-- Toast notification -->
    <BaseToast
      v-if="showToast"
      :mode="toastMode"
      :description="toastMessage"
      :has-close-icon="true"
      positioning="TOP_RIGHT"
    />

    <!-- Initial load gate. Keeps the form hidden behind a spinner
         while the on-mount project fetch is in flight so the user
         doesn't see a half-populated form flash. -->
    <div v-if="initialLoading" class="flex justify-center py-20">
      <BaseSpinner size="lg" color="emerald" />
    </div>

    <template v-else>
    <!-- Header -->
    <div class="mb-8">
      <h1 class="text-2xl font-bold" :class="headingClasses">{{ isEditMode ? 'Edit Mock' : 'Create Mock' }}</h1>
      <p class="mt-1" :class="t.dimTextAlt">
        {{ isEditMode ? 'Update the WireMock stub mapping.' : 'Define a WireMock stub mapping with request and response specifications.' }}
      </p>
    </div>

    <!--
      Two-column layout on lg+: main form on the left, sticky right column
      holding the validation report, cURL preview, and submit button.
      Using CSS grid (rather than flex) so both columns are guaranteed to
      start at the same row baseline — the right column's sticky `top-4`
      offset only kicks in once the user scrolls past the panel, so at rest
      the General card and the Test with cURL card sit at exactly the same
      vertical position. Below lg the grid collapses to a single column and
      the side panel drops beneath the form.
    -->
    <div class="lg:grid lg:grid-cols-[minmax(0,1fr)_28rem] lg:gap-6 lg:items-start">
      <div class="min-w-0 lg:max-w-4xl">
    <form @submit.prevent="handleSubmit" class="space-y-6">

      <!-- ═══════════════════════════════════════════════════════ -->
      <!--  GENERAL (collapsible)                                  -->
      <!-- ═══════════════════════════════════════════════════════ -->
      <BaseCollapsibleSection
        title="General"
        :collapsed="collapsedSections.general"
        @toggle="toggleSection('general')"
      >

        <!-- Read-only Mock ID (edit mode only) -->
        <div v-if="isEditMode && props.mock" class="mb-4">
          <label class="block text-sm font-medium mb-1" :class="labelClasses">Mock ID</label>
          <div class="flex items-center gap-2">
            <input :value="props.mock.id" readonly
              class="flex-1 rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none transition-colors cursor-default"
              :class="isDark ? 'bg-gray-800/50 border-gray-600 text-gray-400' : 'bg-gray-50 border-gray-300 text-gray-500'" />
            <BaseCopyButton :text="props.mock!.id" label="Mock ID" variant="bordered" :reset-ms="2000" />
          </div>
        </div>

        <!-- Read-only Project info (always shown when a project is bound).
             Project name is fetched from /api/projects/{id}; UUID is the
             internal id. Neither field is editable — the binding is set by
             the route the user came in through. -->
        <div v-if="props.projectId || isEditMode" class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label class="block text-sm font-medium mb-1" :class="labelClasses">Project Name</label>
            <input :value="projectName || '—'" readonly
              class="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none transition-colors cursor-default"
              :class="isDark ? 'bg-gray-800/50 border-gray-600 text-gray-400' : 'bg-gray-50 border-gray-300 text-gray-500'" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1" :class="labelClasses">Project UUID</label>
            <div class="flex items-center gap-2">
              <input :value="internalProjectId" readonly
                class="flex-1 rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none transition-colors cursor-default"
                :class="isDark ? 'bg-gray-800/50 border-gray-600 text-gray-400' : 'bg-gray-50 border-gray-300 text-gray-500'" />
              <BaseCopyButton :text="internalProjectId" label="Project UUID" variant="bordered" :reset-ms="2000" />
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div :class="{ 'md:col-span-2': props.projectId || isEditMode }">
            <label for="mockName" class="block text-sm font-medium mb-1" :class="[labelClasses, !mockName.trim() ? (t.redText) : '']">Mock Name *</label>
            <input id="mockName" v-model="mockName" type="text" placeholder="e.g. create-event-success"
              class="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors" :class="requiredInputClasses(mockName)" />
            <!-- Name collision warning. Rendered only when the backend
                 confirmed (true) that a mock with this name already
                 exists under this project. Hidden in the empty / no-
                 collision / transient-error cases so the form stays
                 quiet while the user is mid-edit. -->
            <p v-if="nameExists" class="mt-2 text-xs font-medium"
              :class="t.amberTextStrong">
              A mock with this name already exists in this project.
            </p>
          </div>
          <div v-if="!props.projectId && !isEditMode">
            <label for="projectId" class="block text-sm font-medium mb-1" :class="[labelClasses, !internalProjectId.trim() ? (t.redText) : '']">Project ID *</label>
            <input id="projectId" v-model="internalProjectId" type="text" placeholder="UUID of the project"
              class="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors" :class="requiredInputClasses(internalProjectId)" />
          </div>
        </div>

        <div class="mt-4">
          <label for="description" class="block text-sm font-medium mb-1" :class="labelClasses">Description</label>
          <textarea id="description" v-model="description" rows="4" placeholder="Add notes or description for this mock..."
            class="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors" :class="inputClasses" />
        </div>

        <div class="mt-4">
          <label for="priority" class="block text-sm font-medium mb-1" :class="labelClasses">Priority</label>
          <input id="priority" v-model.number="priority" type="number" min="1" placeholder="5 (lower = higher priority)"
            class="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors" :class="inputClasses" />
          <div
            class="mt-2 text-xs rounded-md border px-3 py-2 leading-relaxed"
            :class="isDark ? 'border-slate-700 bg-slate-800/60 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600'"
          >
            <p class="font-medium mb-1" :class="t.dimTextAlt">How priority works</p>
            <p>
              Priority decides which stub wins when more than one could match a request.
              <span class="font-medium">Lower number = higher priority</span> — <code>1</code> beats <code>5</code>.
              If you don't set one, WireMock uses a default of <code>5</code>.
            </p>
            <p class="mt-1">
              When multiple matching stubs share the same priority, the
              <span class="font-medium">most recently added</span> one wins.
            </p>
          </div>
        </div>

        <div class="mt-4 flex items-center gap-2">
          <input id="persistent" v-model="persistent" type="checkbox" class="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
          <label for="persistent" class="text-sm" :class="labelClasses">Persistent (survives resets)</label>
        </div>

      </BaseCollapsibleSection>

      <!-- ═══════════════════════════════════════════════════════ -->
      <!--  METADATA (collapsible)                                 -->
      <!-- ═══════════════════════════════════════════════════════ -->
      <BaseCollapsibleSection
        title="Metadata"
        :collapsed="collapsedSections.metadata"
        @toggle="toggleSection('metadata')"
      >
          <p class="text-xs mb-4" :class="t.dimText">Arbitrary key-value pairs for tagging, filtering, and bulk operations.</p>
          <div class="flex items-center justify-end mb-2">
            <BaseChipButton @click="metadataRows.push({ key: '', value: '', valueType: 'text' })">+ Add</BaseChipButton>
          </div>
          <div v-for="(row, i) in metadataRows" :key="i" class="mb-2">
            <!--
              Accessible naming for dynamic key/value rows:
              the row itself has no visible label, so each control names
              itself via aria-label so screen readers announce "Metadata
              key 1", "Metadata value type 1", etc.
            -->
            <div class="flex gap-2 items-center">
              <input v-model="row.key" placeholder="Key" :readonly="row.locked"
                :aria-label="`Metadata key ${i + 1}`"
                class="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors"
                :class="row.locked
                  ? (isDark ? 'bg-gray-800/50 border-gray-600 text-gray-400 cursor-default' : 'bg-gray-50 border-gray-300 text-gray-500 cursor-default')
                  : (isMetadataKeyInvalid(row) || isDuplicateMetadataKey(row) ? 'ring-2 ring-red-400 border-red-400' : inputClasses)" />
              <div class="w-24 shrink-0">
                <BaseDropdown v-model="row.valueType" :options="METADATA_VALUE_TYPE_OPTIONS"
                  :disabled="row.locked" size="sm"
                  :aria-label="`Metadata value type ${i + 1}`" />
              </div>
              <input v-if="row.valueType === 'text'" v-model="row.value" placeholder="Value" :readonly="row.locked"
                :aria-label="`Metadata value ${i + 1}`"
                class="flex-[2] min-w-0 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors"
                :class="row.locked
                  ? (isDark ? 'bg-gray-800/50 border-gray-600 text-gray-400 cursor-default' : 'bg-gray-50 border-gray-300 text-gray-500 cursor-default')
                  : (isMetadataValueMissing(row) ? 'ring-2 ring-red-400 border-red-400' : inputClasses)" />
              <textarea v-else v-model="row.value" placeholder='e.g. {"key": "value"}' :readonly="row.locked" rows="3"
                :aria-label="`Metadata JSON value ${i + 1}`"
                class="flex-[2] min-w-0 rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 transition-colors"
                :class="[
                  row.locked ? (isDark ? 'bg-gray-800/50 border-gray-600 text-gray-400 cursor-default' : 'bg-gray-50 border-gray-300 text-gray-500 cursor-default') : inputClasses,
                  !row.locked && (isMetadataValueMissing(row) || (row.value.trim() && !isValidJson(row.value))) ? 'ring-2 ring-red-400 border-red-400' : ''
                ]" />
              <span v-if="row.locked" class="text-xs px-2 py-1 rounded whitespace-nowrap"
                :class="isDark ? 'bg-gray-800 text-gray-500' : 'bg-gray-100 text-gray-400'"
                title="This metadata entry is auto-managed and cannot be edited or removed">locked</span>
              <BaseRemoveButton v-else :aria-label="`Remove metadata row ${i + 1}`"
                @click="removeRow(metadataRows, i)" />
            </div>
            <p v-if="isMetadataKeyInvalid(row)" class="text-xs mt-1 text-red-400">
              Key cannot contain whitespace. Use letters, digits, and punctuation like `_`, `-`, or `.`.
            </p>
            <p v-if="isDuplicateMetadataKey(row)" class="text-xs mt-1 text-red-400">
              Duplicate key — each metadata key must be unique.
            </p>
            <p v-if="isMetadataValueMissing(row)" class="text-xs mt-1 text-red-400">
              Value is required when a key is provided.
            </p>
            <p v-if="!row.locked && row.valueType === 'json' && row.value.trim() && !isValidJson(row.value)"
              class="text-xs mt-1 text-red-400">Invalid JSON — please check your syntax.</p>
          </div>
          <p v-if="metadataRows.length === 0" class="text-xs italic" :class="t.dimText">No metadata defined.</p>
      </BaseCollapsibleSection>

      <!-- ═══════════════════════════════════════════════════════ -->
      <!--  REQUEST MATCHING (collapsible)                         -->
      <!-- ═══════════════════════════════════════════════════════ -->
      <BaseCollapsibleSection
        title="Request Matching"
        :collapsed="collapsedSections.requestMatching"
        @toggle="toggleSection('requestMatching')"
      >

        <!-- URL Match — sits on its own row, full width, so the matcher
             type is the first thing the user picks before anything else
             on the row below (method + URL value). Keeps the long
             selector visually distinct from the method/URL pair. -->
        <div class="mb-6">
          <label class="block text-sm font-medium mb-1" :class="labelClasses">URL Match</label>
          <BaseDropdown v-model="urlMatchType" :options="URL_MATCH_TYPE_OPTIONS"
            size="sm" aria-label="URL Match" />
          <!--
            Live helper text for the selected URL-match mode. Reactive on
            `urlMatchType` so the explanation swaps the moment the user
            changes the dropdown — gives immediate context for what the
            mode compares against (full URL vs. path, exact vs. regex)
            without sending them to the WireMock docs.
          -->
          <p v-if="getUrlMatchInfo(urlMatchType)"
            class="mt-1.5 text-xs flex items-start gap-1.5"
            :class="isDark ? 'text-emerald-300/80' : 'text-emerald-700'"
            role="note">
            <svg class="w-4 h-4 shrink-0 mt-0.5" :class="t.emeraldText"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{{ getUrlMatchInfo(urlMatchType) }}</span>
          </p>
        </div>

        <!-- Method + URL -->
        <div class="grid grid-cols-1 md:grid-cols-12 gap-4 mb-6">
          <div class="md:col-span-2">
            <label class="block text-sm font-medium mb-1" :class="labelClasses">Method</label>
            <BaseDropdown v-model="httpMethod" :options="HTTP_METHOD_OPTIONS"
              size="sm" aria-label="Method" />
          </div>
          <div class="md:col-span-10">
            <label for="urlValue" class="block text-sm font-medium mb-1"
              :class="[labelClasses, (!urlValue.trim() || urlValue.trim() === '/' || urlValidationError) ? (t.redText) : '']">URL *</label>
            <!--
              URL is namespaced under the project: every mock under "Acme
              Project" gets `/acme-project` prefixed automatically. The
              prefix renders as a non-editable badge attached to the left
              of the input so the user sees the full effective path while
              only typing the part that matters.
            -->
            <div class="flex">
              <span v-if="projectUrlPrefix"
                class="inline-flex items-center rounded-l-lg border border-r-0 px-3 py-2 text-sm font-mono whitespace-nowrap select-none cursor-default"
                :class="isDark ? 'bg-gray-800/70 border-gray-600 text-gray-400' : 'bg-gray-100 border-gray-300 text-gray-500'"
                :title="`Project namespace — locked to project '${projectName}'`">{{ projectUrlPrefix }}</span>
              <input id="urlValue" v-model="urlValue" type="text" placeholder="/api/v1/resource"
                class="flex-1 min-w-0 border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 transition-colors"
                :class="[
                  projectUrlPrefix ? 'rounded-r-lg' : 'rounded-lg',
                  urlValidationError
                    ? (isDark ? 'bg-gray-800 border-red-500 text-gray-100 focus:ring-red-500 focus:border-red-500 ring-1 ring-red-500/30' : 'bg-white border-red-400 text-gray-800 focus:ring-red-500 focus:border-red-500 ring-1 ring-red-400/30')
                    : requiredInputClasses(urlValue.trim() === '/' ? '' : urlValue),
                ]" />
            </div>
            <p v-if="urlValidationError" class="text-xs text-red-500 mt-1">{{ urlValidationError }}</p>

            <!-- URL collision warning. Rendered only when the backend
                 confirmed (200 OK true) that a mock at the namespaced URL
                 already exists under this project. This is informational
                 only — duplicate URLs are allowed (priority/scenario
                 stacking, recording flows, etc.). -->
            <BaseAlert v-if="urlExists" compact :color="AlertEnum.WARNING" class="mt-2">
              <p class="font-medium">
                Heads up: another mock in this project already uses this URL. You can still save — WireMock allows multiple stubs at the same URL (e.g. priority or scenario stacking).
              </p>
            </BaseAlert>

            <div v-if="getRegexExamples(urlMatchType)" class="mt-1.5 text-xs" :class="t.dimText">
              <span class="font-medium" :class="t.dimTextAlt">{{ getRegexExamples(urlMatchType)!.tip }}</span>
              <span class="ml-1">Examples:</span>
              <code v-for="(ex, idx) in getRegexExamples(urlMatchType)!.examples" :key="idx"
                class="ml-1 px-1.5 py-0.5 rounded text-xs font-mono cursor-pointer hover:opacity-80 transition-opacity"
                :class="isDark ? 'bg-gray-800 text-emerald-300' : 'bg-gray-100 text-emerald-700'"
                :title="'Click to use: ' + ex"
                @click="urlValue = ex">{{ ex }}</code>
            </div>
          </div>
        </div>

        <!-- Query parameters with matcher types -->
        <!--
          The whole section is disabled (visually + functionally) when
          urlMatchType is a full-URL mode (`url` / `urlPattern`). We render
          an explanatory note so the user knows why the inputs are inert —
          those modes already match the query string as part of the URL, so
          a separate query matcher would be redundant (and would break the
          match once a query string is present).
        -->
        <div class="mb-6" :class="{ 'opacity-60': isQueryParamsDisabled }">
          <div class="flex items-center justify-between mb-2">
            <label class="block text-sm font-medium" :class="labelClasses">Query Parameters</label>
            <BaseChipButton
              :disabled="isQueryParamsDisabled"
              :title="isQueryParamsDisabled ? 'Query parameters are matched as part of the URL when URL Match is set to “Exact URL” or “URL Regex”.' : ''"
              @click="addMatcherRow(queryParams)">+ Add</BaseChipButton>
          </div>
          <p v-if="isQueryParamsDisabled"
            class="mb-2 text-xs flex items-start gap-1.5"
            :class="isDark ? 'text-amber-300/80' : 'text-amber-700'"
            role="note">
            <svg class="w-4 h-4 shrink-0 mt-0.5" :class="t.amberText"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Query Parameters are disabled because URL Match is set to <strong>{{ urlMatchType === 'url' ? 'Exact URL' : 'URL Regex' }}</strong>, which already matches the query string as part of the URL — include any query parameters directly in the URL field above. Switch to <strong>Exact Path</strong> or <strong>Path Regex</strong> if you need separate query-parameter matchers.</span>
          </p>
          <div v-for="(param, i) in queryParams" :key="i" class="mb-2">
            <!--
              Three-column grid keeps key, matcher and value visibly
              side-by-side even when the form area is squeezed by the
              validation panel: key gets a flexible share capped at
              12rem, matcher a fixed 6rem column, and value fills the
              remaining space. `min-w-0` on every cell lets each column
              shrink instead of being pushed wider by intrinsic content
              width (e.g. the longest dropdown option).
            -->
            <div class="grid grid-cols-[minmax(0,2fr)_6rem_minmax(0,3fr)] items-start gap-2 w-full min-w-0">
              <input v-model="param.key" placeholder="Key"
                :aria-label="`Query parameter name ${i + 1}`"
                :disabled="isQueryParamsDisabled"
                class="min-w-0 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors disabled:cursor-not-allowed"
                :class="isMatcherRowKeyMissing(param) ? requiredInputClasses('') : inputClasses" />
              <BaseDropdown v-model="param.matcherType" :options="MATCHER_TYPES"
                :disabled="isQueryParamsDisabled" size="sm" class="min-w-0"
                :aria-label="`Query parameter matcher type ${i + 1}`" />
              <div class="flex gap-2 items-start min-w-0">
                <BaseDateTimePicker v-if="DATETIME_MATCHERS.has(param.matcherType)"
                  class="flex-1 min-w-0"
                  :model-value="dateTimePickerValue(param.value)" :model-type="PICKER_MODEL_TYPE"
                  :time-config="{ enableSeconds: true }" format="dd/MM/yyyy HH:mm:ss"
                  @update:model-value="(v) => setDateTimeFromPicker(param, v)"
                  :aria-labels="{ input: `Query parameter value ${i + 1}` }"
                  :disabled="isQueryParamsDisabled"
                  :input-attrs="{ state: isMatcherRowValueMissing(param) ? false : undefined }" />
                <input v-else v-model="param.value" placeholder="Value"
                  :disabled="isQueryParamsDisabled || param.matcherType === 'absent'"
                  :aria-label="`Query parameter value ${i + 1}`"
                  class="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors disabled:cursor-not-allowed"
                  :class="isMatcherRowValueMissing(param) ? requiredInputClasses('') : inputClasses" />
                <BaseRemoveButton :aria-label="`Remove query parameter ${i + 1}`"
                  :disabled="isQueryParamsDisabled" class="pt-1"
                  @click="removeRow(queryParams, i)" />
              </div>
            </div>
            <label v-if="supportsCaseInsensitive(param.matcherType)"
              class="flex items-center gap-1.5 text-xs mt-1"
              :class="[labelClasses, isQueryParamsDisabled ? 'cursor-not-allowed' : 'cursor-pointer']">
              <input type="checkbox" v-model="param.caseInsensitive"
                :aria-label="`Query parameter ${i + 1} case insensitive`"
                :disabled="isQueryParamsDisabled"
                class="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 disabled:cursor-not-allowed" />
              Case insensitive
            </label>
            <p v-if="isMatcherRowValueMissing(param)" class="text-xs text-red-500 mt-1">
              Query parameter value is required when a name is provided.
            </p>
            <p v-if="isMatcherRowKeyMissing(param)" class="text-xs text-red-500 mt-1">
              Query parameter name is required when a value is provided.
            </p>
            <div v-if="getRegexExamples(param.matcherType)" class="mt-1 text-xs" :class="t.dimText">
              <span class="font-medium" :class="t.dimTextAlt">{{ getRegexExamples(param.matcherType)!.tip }}</span>
              <span class="ml-1">E.g.</span>
              <code v-for="(ex, idx) in getRegexExamples(param.matcherType)!.examples" :key="idx"
                class="ml-1 px-1.5 py-0.5 rounded text-xs font-mono cursor-pointer hover:opacity-80 transition-opacity"
                :class="isDark ? 'bg-gray-800 text-emerald-300' : 'bg-gray-100 text-emerald-700'"
                :title="'Click to use: ' + ex"
                @click="param.value = ex">{{ ex }}</code>
            </div>
          </div>
          <p v-if="queryParams.length === 0" class="text-xs italic" :class="t.dimText">No query parameters defined.</p>
        </div>

        <!-- Request headers with matcher types -->
        <div class="mb-6">
          <div class="flex items-center justify-between mb-2">
            <label class="block text-sm font-medium" :class="labelClasses">Headers</label>
            <BaseChipButton @click="addMatcherRow(requestHeaders)">+ Add</BaseChipButton>
          </div>
          <div v-for="(header, i) in requestHeaders" :key="i" class="mb-2">
            <!-- Three-column grid: key (flexible, capped at 12rem),
                 matcher select (fixed 6rem), value (1fr). Guarantees
                 the three fields stay side-by-side even when the form
                 area is squeezed by the validation panel. -->
            <div class="grid grid-cols-[minmax(0,2fr)_6rem_minmax(0,3fr)] items-start gap-2 w-full min-w-0">
              <input v-model="header.key" placeholder="Header name"
                :aria-label="`Request header name ${i + 1}`"
                class="min-w-0 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors"
                :class="isMatcherRowKeyMissing(header) || isDuplicateRequestHeaderKey(header) ? requiredInputClasses('') : inputClasses" />
              <BaseDropdown v-model="header.matcherType" :options="MATCHER_TYPES"
                size="sm" class="min-w-0"
                :aria-label="`Request header matcher type ${i + 1}`" />
              <div class="flex gap-2 items-start min-w-0">
                <BaseDateTimePicker v-if="DATETIME_MATCHERS.has(header.matcherType)"
                  class="flex-1 min-w-0"
                  :model-value="dateTimePickerValue(header.value)" :model-type="PICKER_MODEL_TYPE"
                  :time-config="{ enableSeconds: true }" format="dd/MM/yyyy HH:mm:ss"
                  @update:model-value="(v) => setDateTimeFromPicker(header, v)"
                  :aria-labels="{ input: `Request header expected value ${i + 1}` }"
                  :input-attrs="{ state: isMatcherRowValueMissing(header) ? false : undefined }" />
                <input v-else v-model="header.value" placeholder="Expected value" :disabled="header.matcherType === 'absent'"
                  :aria-label="`Request header expected value ${i + 1}`"
                  class="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors"
                  :class="isMatcherRowValueMissing(header) ? requiredInputClasses('') : inputClasses" />
                <BaseRemoveButton :aria-label="`Remove request header ${i + 1}`" class="pt-1"
                  @click="removeRow(requestHeaders, i)" />
              </div>
            </div>
            <label v-if="supportsCaseInsensitive(header.matcherType)"
              class="flex items-center gap-1.5 text-xs mt-1 cursor-pointer"
              :class="labelClasses">
              <input type="checkbox" v-model="header.caseInsensitive"
                :aria-label="`Request header ${i + 1} case insensitive`"
                class="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
              Case insensitive
            </label>
            <p v-if="isMatcherRowValueMissing(header)" class="text-xs text-red-500 mt-1">
              Header value is required when a header name is provided.
            </p>
            <p v-if="isMatcherRowKeyMissing(header)" class="text-xs text-red-500 mt-1">
              Header name is required when a value is provided.
            </p>
            <p v-if="isDuplicateRequestHeaderKey(header)" class="text-xs text-red-500 mt-1">
              Duplicate header — each request header name must be unique.
            </p>
            <div v-if="getRegexExamples(header.matcherType)" class="mt-1 text-xs" :class="t.dimText">
              <span class="font-medium" :class="t.dimTextAlt">{{ getRegexExamples(header.matcherType)!.tip }}</span>
              <span class="ml-1">E.g.</span>
              <code v-for="(ex, idx) in getRegexExamples(header.matcherType)!.examples" :key="idx"
                class="ml-1 px-1.5 py-0.5 rounded text-xs font-mono cursor-pointer hover:opacity-80 transition-opacity"
                :class="isDark ? 'bg-gray-800 text-emerald-300' : 'bg-gray-100 text-emerald-700'"
                :title="'Click to use: ' + ex"
                @click="header.value = ex">{{ ex }}</code>
            </div>
          </div>
          <p v-if="requestHeaders.length === 0" class="text-xs italic" :class="t.dimText">No request headers defined.</p>
        </div>

        <!-- Body patterns with multiple matcher types -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="block text-sm font-medium" :class="labelClasses">Body Patterns</label>
            <BaseChipButton @click="addBodyPatternRow()">+ Add</BaseChipButton>
          </div>
          <p class="text-xs mb-2" :class="t.dimText">
            Multiple patterns are allowed and AND-combined (e.g. `contains` + regex both apply).
          </p>
          <!--
            Nonsensical combinations (two literal-body matchers, or `absent`
            combined with anything) surface as a red notice so the user can
            fix them before submitting.
          -->
          <BaseAlert v-if="bodyPatternIssues.length > 0" compact :color="AlertEnum.ERROR">
            <div class="space-y-1">
              <p v-for="(issue, idx) in bodyPatternIssues" :key="idx">{{ issue }}</p>
            </div>
          </BaseAlert>
          <div v-for="(bp, i) in bodyPatterns" :key="i" class="mb-3 p-3 rounded-lg border" :class="isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-100 bg-gray-50'">
            <!--
              Header strip stacks the matcher select, the equalToJson
              checkboxes, and the remove button on mobile. flex-wrap +
              `sm:flex-nowrap` keeps them on one line as soon as we have
              the room (≥sm) without forcing horizontal scroll on phones.
            -->
            <div class="flex flex-wrap sm:flex-nowrap gap-2 mb-2 items-center">
              <div class="w-full sm:w-1/3">
                <BaseDropdown v-model="bp.matcherType" :options="BODY_MATCHER_TYPES"
                  size="sm" aria-label="Body pattern matcher type" />
              </div>
              <div v-if="bp.matcherType === 'equalToJson'" class="flex flex-wrap items-center gap-x-3 gap-y-1">
                <label class="flex items-center gap-1 text-xs" :class="labelClasses">
                  <input type="checkbox" v-model="bp.ignoreArrayOrder" class="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" /> Ignore array order
                </label>
                <label class="flex items-center gap-1 text-xs" :class="labelClasses">
                  <input type="checkbox" v-model="bp.ignoreExtraElements" class="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" /> Ignore extra elements
                </label>
              </div>
              <BaseRemoveButton class="ml-auto" aria-label="Remove body pattern"
                @click="removeRow(bodyPatterns, i)" />
            </div>
            <!-- Per-row file upload — same affordance as the Response Body
                 "Upload file" helper. Only shown for matchers whose value is
                 an actual body payload (JSON / XML / Text / Base64); the
                 file's contents replace the pattern value below. -->
            <div v-if="bodyPatternSupportsUpload(bp.matcherType)" class="flex flex-wrap items-center gap-2 mb-2">
              <label class="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors"
                :class="[
                  isDark ? 'text-emerald-300 border-emerald-700 bg-emerald-900/30 hover:bg-emerald-800/50' : 'text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100',
                  bp.uploadFileLoading ? 'opacity-60 pointer-events-none cursor-wait' : 'cursor-pointer',
                ]"
                :title="`Pick a ${bodyPatternUploadFormatLabel(bp.matcherType)} file — its contents will replace the pattern value below.`">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5m0 0l5 5m-5-5v12" />
                </svg>
                Upload file
                <input type="file" :accept="bodyPatternUploadAccept(bp.matcherType)"
                  :disabled="bp.uploadFileLoading"
                  @change="(e) => handleBodyPatternFileUpload(e, bp)"
                  class="hidden" />
              </label>
              <span v-if="bp.uploadFileLoading" class="inline-flex items-center gap-1.5 text-xs" :class="t.dimText">
                <BaseSpinner size="sm" color="emerald" />
                Reading file…
              </span>
              <span v-else-if="bp.uploadedFileName" class="text-xs" :class="t.mutedText">
                <code class="font-mono">{{ bp.uploadedFileName }}</code>
                <span v-if="bp.uploadedFileSize" class="ml-1" :class="t.dimText">
                  ({{ formatFileSize(bp.uploadedFileSize) }})
                </span>
                <button type="button" @click="clearBodyPatternFile(bp)"
                  class="ml-2 text-red-400 hover:text-red-600"
                  :aria-label="`Remove uploaded file ${bp.uploadedFileName}`"
                  title="Clear the uploaded file and reset the pattern value">&times;</button>
              </span>
              <span v-else class="text-xs italic" :class="t.dimText">
                Load a <span class="font-medium">{{ bodyPatternUploadFormatLabel(bp.matcherType) }}</span> file — its contents replace the value below.
              </span>
            </div>
            <p v-if="bp.uploadFileError" class="text-xs text-red-500 mb-1">{{ bp.uploadFileError }}</p>
            <!-- Datetime matchers swap the textarea for a calendar input,
                 sitting in place of the expected value. Picking writes an
                 ISO-8601 timestamp into bp.value. -->
            <BaseDateTimePicker v-if="DATETIME_MATCHERS.has(bp.matcherType)"
              class="w-full"
              :model-value="dateTimePickerValue(bp.value)" :model-type="PICKER_MODEL_TYPE"
              :time-config="{ enableSeconds: true }" format="dd/MM/yyyy HH:mm:ss"
              @update:model-value="(v) => setDateTimeFromPicker(bp, v)" />
            <textarea v-else-if="bp.matcherType !== 'absent'" v-model="bp.value" rows="3"
              :placeholder="bp.matcherType === 'equalToJson' ? '{ &quot;key&quot;: &quot;value&quot; }'
                : bp.matcherType === 'matchesJsonPath' ? '$.name'
                : bp.matcherType === 'equalToXml' ? '&lt;user id=&quot;1&quot;&gt;Alice&lt;/user&gt;'
                : 'Pattern...'"
              class="w-full rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 transition-colors"
              :class="[inputClasses, bodyPatternRowFormatError(bp) ? 'border-red-400' : '']" />
            <p v-if="bodyPatternRowFormatError(bp)" class="text-xs text-red-500 mt-1">
              {{ bodyPatternRowFormatError(bp) }}
            </p>
            <div v-if="getRegexExamples(bp.matcherType)" class="mt-1 text-xs" :class="t.dimText">
              <span class="font-medium" :class="t.dimTextAlt">{{ getRegexExamples(bp.matcherType)!.tip }}</span>
              <span class="ml-1">E.g.</span>
              <code v-for="(ex, idx) in getRegexExamples(bp.matcherType)!.examples" :key="idx"
                class="ml-1 px-1.5 py-0.5 rounded text-xs font-mono cursor-pointer hover:opacity-80 transition-opacity"
                :class="isDark ? 'bg-gray-800 text-emerald-300' : 'bg-gray-100 text-emerald-700'"
                :title="'Click to use: ' + ex"
                @click="bp.value = ex">{{ ex }}</code>
            </div>

            <!--
              Per-matcher advanced fieldsets. Only the relevant block
              renders for the chosen matcher kind. Empty values aren't
              emitted on save (see buildBodyPatternObject) so users can
              leave any of these blank without polluting the wire payload.
            -->

            <!-- JSONPath: optional sub-matcher and vary-by. Setting either
                 promotes the pattern from the bare-expression form
                 (`matchesJsonPath: "$.name"`) to the object form
                 (`matchesJsonPath: { expression, equalTo|contains|… }`).
                 The sub-matcher is applied to the value the JSONPath
                 expression extracts from the request body. -->
            <div v-if="bp.matcherType === 'matchesJsonPath'" class="mt-2 space-y-3">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-medium mb-1" :class="labelClasses">
                    Sub-matcher <span class="font-normal" :class="t.dimText">(optional)</span>
                  </label>
                  <BaseDropdown v-model="bp.jsonPathSubMatcher" :options="JSONPATH_SUB_MATCHERS"
                    size="sm" aria-label="JSONPath sub-matcher" />
                </div>
                <div v-if="bp.jsonPathSubMatcher && bp.jsonPathSubMatcher !== 'absent'">
                  <label class="block text-xs font-medium mb-1" :class="labelClasses">
                    Sub-matcher value
                  </label>
                  <input v-model="bp.jsonPathSubMatcherValue" type="text"
                    :placeholder="bp.jsonPathSubMatcher === 'equalToJson' ? '{ &quot;name&quot;: &quot;Alice&quot; }' : 'Alice'"
                    class="w-full rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 transition-colors" :class="inputClasses" />
                </div>
              </div>
              <p v-if="bp.jsonPathSubMatcher" class="text-xs" :class="t.dimText">
                Saves as <code class="font-mono">{{ '{' }} matchesJsonPath: {{ '{' }} expression, {{ bp.jsonPathSubMatcher }}{{ bp.jsonPathSubMatcher === 'absent' ? ': true' : ': "…"' }} {{ '}' }} {{ '}' }}</code>.
              </p>
              <div>
                <label class="block text-xs font-medium mb-1" :class="labelClasses">
                  vary-by <span class="font-normal" :class="t.dimText">(optional)</span>
                </label>
                <input v-model="bp.varyBy" type="text" placeholder="$.tenantId"
                  class="w-full rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 transition-colors" :class="inputClasses" />
                <p class="text-xs mt-1" :class="t.dimText">
                  Sub-expression that controls templated stub variation. Leave blank for plain JSONPath matching.
                </p>
              </div>
            </div>

            <!-- JSON Schema: optional schemaVersion override. -->
            <div v-if="bp.matcherType === 'matchesJsonSchema'" class="mt-2">
              <label class="block text-xs font-medium mb-1" :class="labelClasses">Schema Version</label>
              <div class="w-full md:w-64">
                <BaseDropdown v-model="bp.schemaVersion" :options="JSON_SCHEMA_VERSIONS"
                  size="sm" aria-label="Schema Version" />
              </div>
              <p class="text-xs mt-1" :class="t.dimText">
                The textarea above takes a JSON Schema document; this dropdown selects which draft WireMock validates against.
              </p>
            </div>

            <!-- equalToXml: enablePlaceholders toggle. -->
            <div v-if="bp.matcherType === 'equalToXml'" class="mt-2">
              <label class="flex items-center gap-2 text-xs cursor-pointer" :class="labelClasses">
                <input type="checkbox" v-model="bp.enablePlaceholders"
                  class="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                Enable placeholders
                <span class="font-normal" :class="t.dimText">
                  — <code class="font-mono">${...}</code> tokens in the expected XML are treated as wildcards
                </span>
              </label>
            </div>

            <!-- xPathNamespaces — applies to matchesXPath and equalToXml.
                 Each entry is a (prefix → URI) pair; blank rows are dropped
                 on save. Required when matching XML that uses namespaces. -->
            <div v-if="bp.matcherType === 'matchesXPath' || bp.matcherType === 'equalToXml'" class="mt-3">
              <div class="flex items-center justify-between mb-1">
                <label class="block text-xs font-medium" :class="labelClasses">XML Namespaces</label>
                <BaseChipButton size="xs"
                  @click="(bp.xPathNamespaces ||= []).push({ prefix: '', uri: '' })">+ Add</BaseChipButton>
              </div>
              <div v-for="(ns, nsi) in bp.xPathNamespaces || []" :key="nsi" class="flex flex-col sm:flex-row gap-2 mb-1.5">
                <input v-model="ns.prefix" type="text" placeholder="prefix (e.g. soap)"
                  class="w-full sm:w-1/3 rounded-lg border px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 transition-colors" :class="inputClasses" />
                <div class="flex gap-2 sm:flex-1 min-w-0">
                  <input v-model="ns.uri" type="text" placeholder="URI (e.g. http://schemas.xmlsoap.org/soap/envelope/)"
                    class="flex-1 min-w-0 rounded-lg border px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 transition-colors" :class="inputClasses" />
                  <BaseRemoveButton aria-label="Remove XML namespace"
                    @click="bp.xPathNamespaces!.splice(nsi, 1)" />
                </div>
              </div>
              <p v-if="!bp.xPathNamespaces?.length" class="text-xs italic" :class="t.dimText">
                No namespaces — add one to match XPath expressions in namespaced XML.
              </p>
            </div>

            <!-- DateTime advanced options — apply to before / after /
                 equalToDateTime. truncateExpected/Actual snap both sides
                 to a coarser unit before comparison; expectedOffset shifts
                 the expected value by N units. -->
            <div v-if="DATETIME_BODY_MATCHERS.has(bp.matcherType)" class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium mb-1" :class="labelClasses">Truncate Expected</label>
                <BaseDropdown v-model="bp.truncateExpected" :options="TRUNCATE_OPTIONS"
                  size="sm" aria-label="Truncate Expected" />
              </div>
              <div>
                <label class="block text-xs font-medium mb-1" :class="labelClasses">Truncate Actual</label>
                <BaseDropdown v-model="bp.truncateActual" :options="TRUNCATE_OPTIONS"
                  size="sm" aria-label="Truncate Actual" />
              </div>
              <div>
                <label class="block text-xs font-medium mb-1" :class="labelClasses">Expected Offset</label>
                <input v-model.number="bp.expectedOffset" type="number" placeholder="e.g. 3"
                  class="w-full rounded-lg border px-3 py-1.5 text-xs focus:outline-none focus:ring-2 transition-colors" :class="inputClasses" />
              </div>
              <div>
                <label class="block text-xs font-medium mb-1" :class="labelClasses">Offset Unit</label>
                <BaseDropdown v-model="bp.expectedOffsetUnit" :options="OFFSET_UNITS"
                  size="sm" aria-label="Offset Unit" />
              </div>
            </div>
          </div>
          <p v-if="bodyPatterns.length === 0" class="text-xs italic" :class="t.dimText">No body patterns defined.</p>
        </div>
      </BaseCollapsibleSection>

      <!-- ═══════════════════════════════════════════════════════ -->
      <!--  RESPONSE DEFINITION (collapsible)                      -->
      <!-- ═══════════════════════════════════════════════════════ -->
      <BaseCollapsibleSection
        title="Response Definition"
        :collapsed="collapsedSections.responseDefinition"
        @toggle="toggleSection('responseDefinition')"
      >

        <!--
          Response fields are driven by two switches further down the form:
            - Fault simulation: WireMock discards the whole response (status,
              headers, body, delays) and emits the fault instead.
            - Proxying: WireMock forwards the request upstream; the canned
              status/headers/body are unused, but response delays still apply.
          We surface both states clearly and gate the affected inputs behind
          `fieldset[disabled]` so users can't waste effort configuring dead
          data.
        -->
        <BaseAlert v-if="enableFault" :color="AlertEnum.WARNING" title="Fault simulation is active.">
          <p class="mt-0.5 text-xs opacity-90">
            WireMock will return the configured fault instead of this response,
            so status, headers, body, and delays are ignored. Disable Fault
            Simulation below to edit these fields.
          </p>
        </BaseAlert>
        <BaseAlert v-else-if="enableProxy" :color="AlertEnum.WARNING" title="Proxying is active.">
          <p class="mt-0.5 text-xs opacity-90">
            WireMock will forward matched requests to the configured upstream,
            so the canned status, headers, and body below are ignored. Response
            delays still apply on the returned proxy response. Disable
            Proxying below to serve a canned response instead.
          </p>
        </BaseAlert>

        <fieldset :disabled="enableFault || enableProxy" :class="(enableFault || enableProxy) ? 'opacity-50 pointer-events-none select-none' : ''">

        <!-- Status -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label class="block text-sm font-medium mb-1" :class="[labelClasses, !responseStatus ? (t.redText) : '']">Status Code *</label>
            <!-- HTTP_STATUS_CODES values are numbers, so no .number
                 modifier is needed — BaseDropdown emits the option's
                 value verbatim. -->
            <BaseDropdown v-model="responseStatus" :options="HTTP_STATUS_CODES"
              size="sm" aria-label="Status Code" />
          </div>
          <div>
            <div class="flex items-center justify-between mb-1">
              <label for="responseStatusMessage" class="block text-sm font-medium" :class="labelClasses">Status Message</label>
              <button v-if="isStatusMessageOverridden" type="button"
                @click="responseStatusMessageOverride = null"
                class="text-xs font-medium transition-colors cursor-pointer"
                :class="isDark ? 'text-emerald-400 hover:text-emerald-300' : 'text-emerald-600 hover:text-emerald-700'"
                title="Clear the override and re-track the canonical phrase for this status code">
                Reset
              </button>
            </div>
            <input id="responseStatusMessage" v-model="responseStatusMessage" type="text"
              :placeholder="canonicalStatusMessage || 'Custom reason phrase'"
              class="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors"
              :class="inputClasses" />
            <p class="text-xs mt-1" :class="t.dimTextAlt">
              <template v-if="!isStatusMessageOverridden">
                Defaults to the canonical phrase for the selected status code (<code class="font-mono">{{ canonicalStatusMessage || '—' }}</code>). Type to override.
              </template>
              <template v-else>
                Custom reason phrase — emitted as <code class="font-mono">statusMessage</code> on the response.
              </template>
            </p>
          </div>
        </div>

        <!-- Response headers -->
        <div class="mb-6">
          <div class="flex items-center justify-between mb-2">
            <label class="block text-sm font-medium" :class="labelClasses">Headers</label>
            <BaseChipButton @click="addRow(responseHeaders)">+ Add</BaseChipButton>
          </div>
          <div v-for="(header, i) in responseHeaders" :key="i" class="mb-2">
            <!--
              Two-column grid keeps the header name and value side-by-side
              even when the form area is squeezed by the validation panel.
              The custom-name flow nests its "List" switcher beside the
              input so it stays inside the name column.
            -->
            <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
              <!-- Header name: select from common headers or type custom -->
              <BaseDropdown v-if="!header._customKey"
                :aria-label="`Response header name ${i + 1}`"
                :model-value="responseHeaderOptions(header.key).includes(header.key) ? header.key : '__custom__'"
                :options="responseHeaderNameOptions(header.key)"
                size="sm" class="min-w-0" placeholder="Select header..."
                @update:model-value="(v: string) => v === '__custom__' ? (header._customKey = true, header.key = '') : (header.key = v)" />
              <div v-else class="min-w-0 flex gap-1 items-center">
                <input v-model="header.key"
                  :aria-label="`Response header custom name ${i + 1}`"
                  placeholder="Custom header name"
                  class="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors"
                  :class="isMatcherRowKeyMissing(header) ? requiredInputClasses('') : inputClasses" />
                <button type="button" @click="header._customKey = false"
                  class="text-xs px-2 py-1 rounded border transition-colors whitespace-nowrap"
                  :class="isDark ? 'text-gray-400 border-gray-600 hover:bg-gray-700' : 'text-gray-500 border-gray-300 hover:bg-gray-100'"
                  title="Switch back to header list">List</button>
              </div>
              <!-- Header value paired with the remove button. -->
              <div class="flex gap-2 items-center min-w-0">
                <BaseDropdown v-if="isContentTypeHeader(header.key)" v-model="header.value"
                  :options="contentTypeOptions(header.value).map((ct) => ({ value: ct, label: ct }))"
                  size="sm" class="flex-1 min-w-0"
                  :aria-label="`Response header value ${i + 1}`" />
                <input v-else v-model="header.value"
                  :aria-label="`Response header value ${i + 1}`"
                  placeholder="Header value (supports Handlebars templates)"
                  class="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors"
                  :class="isMatcherRowValueMissing(header) ? requiredInputClasses('') : inputClasses" />
                <BaseRemoveButton :aria-label="`Remove response header ${i + 1}`"
                  @click="removeRow(responseHeaders, i)" />
              </div>
            </div>
            <p v-if="isMatcherRowValueMissing(header)" class="text-xs text-red-500 mt-1">
              Header value is required when a header name is provided.
            </p>
            <p v-if="isMatcherRowKeyMissing(header)" class="text-xs text-red-500 mt-1">
              Header name is required when a value is provided.
            </p>

          </div>
        </div>

        <!-- Response body — the payload format is derived from the
             Content-Type response header (see `responseBodyFormat`), so
             there's no format dropdown here. A small pill next to the
             label shows the detected format; validation errors appear
             inline below the textarea. -->
        <div class="mb-6">
          <div class="flex items-center justify-between gap-4 mb-2">
            <div class="flex items-center gap-2">
              <label class="block text-sm font-medium" :class="labelClasses">Response Body</label>
              <span class="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full"
                :class="isDark ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-100 text-emerald-800'"
                :title="'Validation and payload shape derived from Content-Type (' + responseContentType + ')'">
                {{ responseBodyFormatLabel }}
              </span>
            </div>
          </div>
          <!--
            Make the Content-Type → body-type relationship explicit (the pill
            alone only explains it on hover). The body type switches between
            JSON / XML / Text / Base64 based on the Content-Type response
            header, so the user knows to change that header to change the type.
          -->
          <p class="text-xs mb-2" :class="t.dimText">
            The body type is
            <span class="font-medium" :class="t.dimTextAlt">{{ responseBodyFormatLabel }}</span>,
            set automatically from the <code class="font-mono">Content-Type</code> response header
            (<code class="font-mono">{{ responseContentType }}</code>). Change that header to switch
            between JSON, XML, Text, or Base64.
          </p>
          <!-- File upload helper. Reads the picked file based on the
               detected response body format:
                 • JSON / XML / Text  → file contents loaded as text and
                   validated against the format.
                 • Binary (base64)    → file read as a data URL, the
                   `data:<mime>;base64,` prefix stripped, the bare
                   base64 payload written into the body.
               Files with a MIME / extension that doesn't match the
               selected Content-Type are rejected before reading.
               Uploading always OVERWRITES the body — any previously
               typed or uploaded content is replaced. -->
          <div class="flex flex-wrap items-center gap-2 mb-2">
            <label class="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors"
              :class="[
                isDark ? 'text-emerald-300 border-emerald-700 bg-emerald-900/30 hover:bg-emerald-800/50' : 'text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100',
                responseBodyFileLoading ? 'opacity-60 pointer-events-none cursor-wait' : 'cursor-pointer',
              ]"
              :title="`Pick a file matching ${responseContentType} — its contents will replace the response body. Accepted: ${responseBodyFileAccept}`">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5m0 0l5 5m-5-5v12" />
              </svg>
              Upload file
              <input type="file" :accept="responseBodyFileAccept"
                :disabled="responseBodyFileLoading"
                @change="handleResponseBodyFileUpload"
                class="hidden" />
            </label>
            <span v-if="responseBodyFileLoading" class="inline-flex items-center gap-1.5 text-xs" :class="t.dimText">
              <BaseSpinner size="sm" color="emerald" />
              Reading file…
            </span>
            <span v-else-if="uploadedFileName" class="text-xs" :class="t.mutedText">
              <code class="font-mono">{{ uploadedFileName }}</code>
              <span v-if="uploadedFileSize" class="ml-1" :class="t.dimText">
                ({{ formatFileSize(uploadedFileSize) }})
              </span>
              <button type="button" @click="clearUploadedFile"
                class="ml-2 text-red-400 hover:text-red-600"
                :aria-label="`Remove uploaded file ${uploadedFileName}`"
                title="Clear the uploaded file and reset the response body">&times;</button>
            </span>
            <span v-else class="text-xs italic" :class="t.dimText">
              Pick a file matching <code class="font-mono">{{ responseContentType }}</code> — its contents will replace the body below.
            </span>
          </div>
          <p v-if="responseBodyFileError" class="text-xs text-red-500 mt-1 mb-1">{{ responseBodyFileError }}</p>
          <textarea v-model="responseBody" rows="6"
            aria-label="Response body"
            :placeholder="responseBodyFormat === 'json' ? '{ &quot;id&quot;: &quot;123&quot;, &quot;status&quot;: &quot;ok&quot; }' :
              responseBodyFormat === 'xml' ? '&lt;response&gt;&lt;status&gt;ok&lt;/status&gt;&lt;/response&gt;' :
              responseBodyFormat === 'base64' ? 'Base64-encoded binary payload — or click Upload file above' :
              'Plain-text response body…'"
            class="w-full rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 transition-colors"
            :class="[inputClasses, { 'border-red-400': !!responseBodyFormatError }]" />
          <p v-if="responseBodyFormatError" class="text-xs text-red-500 mt-1">{{ responseBodyFormatError }}</p>
        </div>

        </fieldset><!-- /disabled-when-fault-or-proxy (status/headers/body) -->

        <!--
          Delay lives in its own fieldset because proxy leaves response delays
          intact — they still apply to the proxied response. Only fault kills
          delays entirely.
        -->
        <fieldset :disabled="enableFault" :class="enableFault ? 'opacity-50 pointer-events-none select-none' : ''">
        <!-- Delay -->
        <div class="border-t pt-4 mb-4" :class="isDark ? 'border-gray-700' : 'border-gray-100'">
          <div class="flex items-center gap-2 mb-3">
            <input id="enableDelay" v-model="enableDelay" type="checkbox" class="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
            <label for="enableDelay" class="text-sm font-medium" :class="labelClasses">Response Delay</label>
          </div>
          <div v-if="enableDelay" class="pl-2 space-y-3">
            <div>
              <label class="block text-sm font-medium mb-1" :class="labelClasses">Delay Type</label>
              <div class="w-full md:w-48">
                <BaseDropdown v-model="delayType" :options="DELAY_TYPE_OPTIONS"
                  size="sm" aria-label="Delay Type" />
              </div>
              <p class="text-xs mt-1" :class="t.dimTextAlt">
                {{ DELAY_TYPE_DESCRIPTIONS[delayType] }}
              </p>
            </div>
            <div v-if="delayType === 'uniform'">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm mb-1" :class="labelClasses">Lower (ms)</label>
                  <input v-model.number="delayLower" type="number" min="0"
                    class="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors"
                    :class="[inputClasses, delayRangeInvalid ? (isDark ? 'border-red-500' : 'border-red-400') : '']" />
                  <p v-if="formatMsAsSeconds(delayLower)" class="text-xs mt-1" :class="t.dimText">
                    {{ formatMsAsSeconds(delayLower) }}
                  </p>
                </div>
                <div>
                  <label class="block text-sm mb-1" :class="labelClasses">Upper (ms)</label>
                  <input v-model.number="delayUpper" type="number" min="0"
                    class="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors"
                    :class="[inputClasses, delayRangeInvalid ? (isDark ? 'border-red-500' : 'border-red-400') : '']" />
                  <p v-if="formatMsAsSeconds(delayUpper)" class="text-xs mt-1" :class="t.dimText">
                    {{ formatMsAsSeconds(delayUpper) }}
                  </p>
                </div>
              </div>
              <p v-if="delayRangeInvalid" class="text-xs text-red-500 mt-1">
                Lower bound cannot be greater than upper bound.
              </p>
            </div>
            <div v-if="delayType === 'lognormal'" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm mb-1" :class="labelClasses">Median (ms)</label>
                <input v-model.number="delayMedian" type="number" min="0"
                  class="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors" :class="inputClasses" />
                <p v-if="formatMsAsSeconds(delayMedian)" class="text-xs mt-1" :class="t.dimText">
                  {{ formatMsAsSeconds(delayMedian) }}
                </p>
              </div>
              <div>
                <label class="block text-sm mb-1" :class="labelClasses">Sigma</label>
                <input v-model.number="delaySigma" type="number" min="0" step="0.01"
                  class="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors" :class="inputClasses" />
              </div>
            </div>
            <div v-if="delayType === 'fixed'">
              <label class="block text-sm mb-1" :class="labelClasses">Delay (ms)</label>
              <input v-model.number="delayFixed" type="number" min="0"
                class="w-full md:w-48 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors" :class="inputClasses" />
              <p v-if="formatMsAsSeconds(delayFixed)" class="text-xs mt-1" :class="t.dimText">
                {{ formatMsAsSeconds(delayFixed) }}
              </p>
            </div>
          </div>
        </div>

        </fieldset><!-- /disabled-when-fault (delay) -->
      </BaseCollapsibleSection>

      <!-- ═══════════════════════════════════════════════════════ -->
      <!--  COOKIES (collapsible)                                  -->
      <!-- ═══════════════════════════════════════════════════════ -->
      <BaseCollapsibleSection
        title="Cookies"
        :collapsed="collapsedSections.cookies"
        :badge="cookies.length > 0 ? String(cookies.length) : null"
        @toggle="toggleSection('cookies')"
      >
          <!-- Info banner — explains both cookie directions so users know
               which "+ Add" button to pick for their use case. -->
          <div class="rounded-lg border p-3 mb-4 text-xs leading-relaxed"
            :class="isDark ? 'border-gray-700 bg-gray-800/40 text-gray-300' : 'border-gray-200 bg-gray-50 text-gray-600'">
            <p class="font-medium mb-1" :class="t.bodyText">
              About cookies
            </p>
            <p class="mb-2">
              Each row is either a <strong>request</strong> matcher or a <strong>response</strong> cookie — pick the direction when you add the row.
            </p>
            <ul class="list-disc pl-4 space-y-1">
              <li><strong>Request</strong>: WireMock matches <code class="font-mono">name=value</code> against the incoming <code class="font-mono">Cookie</code> header using the chosen matcher (equalTo, matches, contains, absent…). The cURL preview includes these as <code class="font-mono">-b 'name=value'</code>. Browsers don't transmit Domain/Path/Secure/etc. on requests, so those attributes don't apply here.</li>
              <li><strong>Response</strong>: the stub emits a <code class="font-mono">Set-Cookie</code> header with <code class="font-mono">name=value</code> plus any attributes you fill in (<strong>Domain</strong>, <strong>Path</strong>, <strong>Expires</strong>, <strong>Max-Age</strong>, <strong>Secure</strong>, <strong>HttpOnly</strong>, <strong>SameSite</strong>). The browser stores it and sends it back on subsequent requests the attributes allow.</li>
            </ul>
          </div>

          <!-- Two add buttons — one per direction — so the user picks the
               cookie's role at creation time. Direction is fixed after
               creation: to change it, delete the row and add a new one
               with the other button. -->

          <div class="flex items-center justify-end gap-2 mb-2">
            <BaseChipButton title="Add a cookie to match on the incoming request"
              @click="addCookieRow('request')">+ Add request cookie</BaseChipButton>
            <BaseChipButton title="Add a cookie to emit on the response via Set-Cookie"
              @click="addCookieRow('response')">+ Add response cookie</BaseChipButton>
          </div>
          <div v-for="(cookie, i) in cookies" :key="i" class="mb-3 rounded-lg border p-3"
            :class="isDark ? 'border-gray-700 bg-gray-800/20' : 'border-gray-200 bg-gray-50/40'">
            <!-- Direction label — static, non-editable. The row's direction
                 is fixed at creation time by whichever + Add button the user
                 pressed. The label just keeps request rows visually distinct
                 from response rows in a mixed list, and reminds the user
                 what this row does; to change direction, delete the row and
                 add a new one with the desired button. -->
            <div class="flex items-center gap-2 mb-2">
              <span class="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                :class="isDark ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-100 text-emerald-800'">
                {{ cookie.direction === 'request' ? 'Request cookie' : 'Response cookie' }}
              </span>
              <span class="text-xs" :class="t.dimText">
                {{ cookie.direction === 'request' ? 'Matches an incoming Cookie header' : 'Emits a Set-Cookie response header' }}
              </span>
            </div>

            <!-- Row 1 — name + (matcher type) + value.
                 • Request: name + matcher dropdown + value (mirrors the
                   Headers/Query/etc. matcher row style).
                 • Response: name + value (no matcher — response cookies are
                   literal values, not patterns).
                 Stacks vertically on mobile; lays out horizontally from sm+. -->
            <div class="flex flex-col sm:flex-row sm:items-start gap-2">
              <input v-model="cookie.key" placeholder="Cookie name"
                class="rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors w-full"
                :class="[
                  isMatcherRowKeyMissing(cookie) ? requiredInputClasses('') : inputClasses,
                  cookie.direction === 'request' ? 'sm:w-1/4' : 'sm:w-1/3',
                ]" />
              <div v-if="cookie.direction === 'request'" class="w-full sm:w-1/4">
                <BaseDropdown v-model="cookie.matcherType" :options="MATCHER_TYPES"
                  size="sm" aria-label="Cookie matcher type" />
              </div>
              <div class="flex gap-2 items-start sm:flex-1 min-w-0">
                <BaseDateTimePicker v-if="cookie.direction === 'request' && DATETIME_MATCHERS.has(cookie.matcherType)"
                  class="flex-1 min-w-0"
                  :model-value="dateTimePickerValue(cookie.value)" :model-type="PICKER_MODEL_TYPE"
                  :time-config="{ enableSeconds: true }" format="dd/MM/yyyy HH:mm:ss"
                  @update:model-value="(v) => setDateTimeFromPicker(cookie, v)"
                  :aria-labels="{ input: 'Cookie value' }"
                  :input-attrs="{ state: isMatcherRowValueMissing(cookie) ? false : undefined }" />
                <input v-else v-model="cookie.value" placeholder="Value"
                  :disabled="cookie.direction === 'request' && cookie.matcherType === 'absent'"
                  class="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors"
                  :class="isMatcherRowValueMissing(cookie) ? requiredInputClasses('') : inputClasses" />
                <BaseRemoveButton class="pt-1" title="Remove cookie" aria-label="Remove cookie"
                  @click="removeRow(cookies, i)" />
              </div>
            </div>
            <label v-if="cookie.direction === 'request' && supportsCaseInsensitive(cookie.matcherType)"
              class="flex items-center gap-1.5 text-xs mt-1 cursor-pointer"
              :class="labelClasses">
              <input type="checkbox" v-model="cookie.caseInsensitive"
                :aria-label="`Cookie ${i + 1} case insensitive`"
                class="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
              Case insensitive
            </label>
            <p v-if="isMatcherRowValueMissing(cookie)" class="text-xs text-red-500 mt-1">
              Cookie value is required when a cookie name is provided.
            </p>
            <p v-if="isMatcherRowKeyMissing(cookie)" class="text-xs text-red-500 mt-1">
              Cookie name is required when a value is provided.
            </p>
            <div v-if="cookie.direction === 'request' && getRegexExamples(cookie.matcherType)"
              class="mt-1 sm:ml-[calc(25%+0.5rem)] text-xs" :class="t.dimText">
              <span class="font-medium" :class="t.dimTextAlt">{{ getRegexExamples(cookie.matcherType)!.tip }}</span>
              <span class="ml-1">E.g.</span>
              <code v-for="(ex, idx) in getRegexExamples(cookie.matcherType)!.examples" :key="idx"
                class="ml-1 px-1.5 py-0.5 rounded text-xs font-mono cursor-pointer hover:opacity-80 transition-opacity"
                :class="isDark ? 'bg-gray-800 text-emerald-300' : 'bg-gray-100 text-emerald-700'"
                :title="'Click to use: ' + ex"
                @click="cookie.value = ex">{{ ex }}</code>
            </div>

            <!-- Row 2 — browser-side cookie attributes. Only meaningful for
                 response cookies; request rows hide this fieldset entirely
                 (browsers never transmit Domain/Path/Secure/etc. on
                 outbound requests). -->
            <fieldset v-if="cookie.direction === 'response'">
              <p class="text-xs font-medium mt-4 mb-2" :class="t.dimTextAlt">
                Cookie attributes <span class="font-normal" :class="t.dimText">(optional — appended to the Set-Cookie header)</span>
              </p>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label class="flex items-center gap-1 text-xs font-medium mb-1" :class="labelClasses">
                    Domain
                    <span class="cursor-help" :class="t.dimText"
                      title="Hosts the cookie is sent to. e.g. 'example.com' (the cookie is also sent to all subdomains). Omit to scope it to the exact origin that set it.">ⓘ</span>
                  </label>
                  <input v-model="cookie.domain" type="text" placeholder="example.com"
                    class="w-full rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 transition-colors"
                    :class="cookieStr(cookie.domain) && !isValidCookieDomain(cookie.domain) ? requiredInputClasses('') : inputClasses" />
                  <p v-if="cookieStr(cookie.domain) && !isValidCookieDomain(cookie.domain)" class="text-xs text-red-500 mt-1">
                    Enter a valid host (e.g. <code class="font-mono">example.com</code> or <code class="font-mono">.example.com</code>) — no scheme, path, or spaces.
                  </p>
                </div>
                <div>
                  <label class="flex items-center gap-1 text-xs font-medium mb-1" :class="labelClasses">
                    Path
                    <span class="cursor-help" :class="t.dimText"
                      title="URL path prefix the cookie is sent with. e.g. '/' (every request) or '/api' (only requests under /api).">ⓘ</span>
                  </label>
                  <input v-model="cookie.path" type="text" placeholder="/"
                    class="w-full rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 transition-colors"
                    :class="cookieStr(cookie.path) && !isValidCookiePath(cookie.path) ? requiredInputClasses('') : inputClasses" />
                  <p v-if="cookieStr(cookie.path) && !isValidCookiePath(cookie.path)" class="text-xs text-red-500 mt-1">
                    Path must start with <code class="font-mono">/</code> and contain no spaces, <code class="font-mono">?</code>, or <code class="font-mono">#</code>.
                  </p>
                </div>
                <div>
                  <label class="flex items-center gap-1 text-xs font-medium mb-1" :class="labelClasses">
                    Expires
                    <span class="cursor-help" :class="t.dimText"
                      title="Absolute expiry timestamp. Pick a date and time — we'll convert it to the HTTP-date format browsers expect. When both Expires and Max-Age are set, browsers prefer Max-Age.">ⓘ</span>
                  </label>
                  <BaseDateTimePicker v-model="cookie.expires" model-type="yyyy-MM-dd'T'HH:mm"
                    class="w-full" :aria-labels="{ input: 'Cookie expires' }" />
                </div>
                <div>
                  <label class="flex items-center gap-1 text-xs font-medium mb-1" :class="labelClasses">
                    Max-Age (seconds)
                    <span class="cursor-help" :class="t.dimText"
                      title="Cookie lifetime in seconds from now. 0 or negative deletes the cookie immediately. Omit for a session cookie.">ⓘ</span>
                  </label>
                  <input v-model="cookie.maxAge" type="number" min="0" placeholder="3600"
                    class="w-full rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 transition-colors" :class="inputClasses" />
                </div>
                <div>
                  <label class="flex items-center gap-1 text-xs font-medium mb-1" :class="labelClasses">
                    SameSite
                    <span class="cursor-help" :class="t.dimText"
                      title="Strict: never sent on cross-site requests. Lax (default): sent on top-level navigations only. None: sent on all cross-site requests (requires Secure).">ⓘ</span>
                  </label>
                  <BaseDropdown v-model="cookie.sameSite" :options="SAME_SITE_OPTIONS"
                    size="sm" aria-label="SameSite" />
                </div>
                <div class="flex flex-col justify-end gap-1 pt-1">
                  <label class="flex items-center gap-2 text-xs font-medium" :class="labelClasses"
                    title="Only send the cookie over HTTPS. Required if SameSite=None.">
                    <input type="checkbox" v-model="cookie.secure"
                      class="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                    Secure
                  </label>
                  <label class="flex items-center gap-2 text-xs font-medium" :class="labelClasses"
                    title="Hide the cookie from JavaScript (document.cookie). Sent only with HTTP(S) requests.">
                    <input type="checkbox" v-model="cookie.httpOnly"
                      class="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                    HttpOnly
                  </label>
                </div>
              </div>

              <!-- SameSite=None without Secure is an invalid combination in
                   modern browsers — surface it inline so the user can fix it. -->
              <p v-if="cookie.sameSite === 'None' && !cookie.secure"
                class="text-xs mt-2" :class="t.amberText">
                Browsers reject <code class="font-mono">SameSite=None</code> without <code class="font-mono">Secure</code>. Enable Secure or pick a different SameSite.
              </p>
            </fieldset>
          </div>
          <p v-if="cookies.length === 0" class="text-xs italic" :class="t.dimText">No cookies defined.</p>
      </BaseCollapsibleSection>

      <!-- ═══════════════════════════════════════════════════════ -->
      <!--  BASIC AUTH (collapsible)                               -->
      <!-- ═══════════════════════════════════════════════════════ -->
      <BasicAuthSection
        :collapsed="collapsedSections.basicAuth"
        :enabled="enableBasicAuth"
        :username="basicAuthUsername"
        :password="basicAuthPassword"
        :mode="basicAuthMode"
        @toggle="toggleSection('basicAuth')"
        @update:enabled="enableBasicAuth = $event"
        @update:username="basicAuthUsername = $event"
        @update:password="basicAuthPassword = $event"
        @update:mode="basicAuthMode = $event"
      />

      <ChunkedDribbleSection
        :collapsed="collapsedSections.chunkedDribble"
        :enabled="enableChunkedDribble"
        :number-of-chunks="chunkedNumberOfChunks"
        :total-duration="chunkedTotalDuration"
        :fault-enabled="enableFault"
        :response-body-length="(responseBody ?? '').length"
        @toggle="toggleSection('chunkedDribble')"
        @update:enabled="enableChunkedDribble = $event"
        @update:number-of-chunks="chunkedNumberOfChunks = $event"
        @update:total-duration="chunkedTotalDuration = $event"
      />

      <FaultSimulationSection
        :collapsed="collapsedSections.faultSimulation"
        :enabled="enableFault"
        :fault-type="faultType"
        :proxy-enabled="enableProxy"
        @toggle="toggleSection('faultSimulation')"
        @update:enabled="enableFault = $event"
        @update:fault-type="faultType = $event"
      />

      <ProxyingSection
        :collapsed="collapsedSections.proxying"
        :enabled="enableProxy"
        :base-url="proxyBaseUrl"
        :additional-headers="additionalProxyHeaders"
        :remove-headers="removeProxyHeaders"
        :remove-input="removeProxyHeaderInput"
        :fault-enabled="enableFault"
        @toggle="toggleSection('proxying')"
        @update:enabled="enableProxy = $event"
        @update:base-url="proxyBaseUrl = $event"
        @update:remove-headers="removeProxyHeaders = $event"
        @update:remove-input="removeProxyHeaderInput = $event"
      />

      <WebhooksSection
        :collapsed="collapsedSections.webhooks"
        :enabled="enableWebhook"
        :url="webhookUrl"
        :method="webhookMethod"
        :headers="webhookHeaders"
        :body="webhookBody"
        :delay-ms="webhookDelayMs"
        @toggle="toggleSection('webhooks')"
        @update:enabled="setWebhookEnabled($event)"
        @update:url="webhookUrl = $event"
        @update:method="webhookMethod = $event"
        @update:body="webhookBody = $event"
        @update:delay-ms="webhookDelayMs = $event"
      />

    </form>
      </div>

      <aside class="lg:mt-0 lg:sticky lg:top-4 space-y-4">
        <div
          v-if="validationIssuesBySection.length > 0"
          class="rounded-xl border transition-colors"
          :class="isDark ? 'bg-amber-950/30 border-amber-800' : 'bg-amber-50 border-amber-200'"
        >
          <div class="flex items-center justify-between gap-2 px-4 py-3 border-b"
            :class="isDark ? 'border-amber-800' : 'border-amber-200'">
            <div class="flex items-center gap-2">
              <h2 class="text-sm font-semibold" :class="isDark ? 'text-amber-200' : 'text-amber-800'">
                Validation
              </h2>
            </div>
            <span class="text-xs px-2 py-0.5 rounded-full"
              :class="isDark ? 'bg-amber-900/60 text-amber-200' : 'bg-amber-100 text-amber-700'">
              {{ validationIssues.length }} issue{{ validationIssues.length === 1 ? '' : 's' }}
            </span>
          </div>
          <div class="p-4 max-h-[50vh] overflow-y-auto text-sm"
            :class="isDark ? 'text-amber-100' : 'text-amber-900'">
            <div v-for="([section, messages], idx) in validationIssuesBySection" :key="section"
              :class="idx > 0 ? 'mt-3 pt-3 border-t' : ''">
              <p class="text-xs font-semibold uppercase tracking-wide mb-1"
                :class="t.amberTextStrong">{{ section }}</p>
              <ul class="list-disc list-inside space-y-1">
                <li v-for="(msg, i) in messages" :key="i" class="leading-snug">{{ msg }}</li>
              </ul>
            </div>
          </div>
        </div>

        <div v-if="curlCommand" class="rounded-xl border transition-colors" :class="sectionClasses">
          <div
            class="flex items-center justify-between gap-2 px-4 py-3 border-b"
            :class="t.border"
          >
            <h2 class="text-sm font-semibold" :class="headingClasses">Test with cURL</h2>
            <div class="flex items-center gap-1">
              <button
                type="button"
                @click="copyCurl"
                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                :class="curlCopied
                  ? (isDark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-50 text-emerald-600')
                  : (isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100')"
              >
                {{ curlCopied ? 'Copied!' : 'Copy' }}
              </button>
            </div>
          </div>
          <div class="p-4">
            <!--
              For regex-based URL Match modes the URL we use in the cURL
              was synthesised from the pattern (resolveRegexToSample),
              not typed by the user — flag that here so they know the
              call is a best-effort starting point and may need
              tweaking before it actually matches the stub.
            -->
            <p v-if="isCurlSynthesised"
              class="mb-2 text-xs flex items-start gap-1.5"
              :class="isDark ? 'text-amber-300/80' : 'text-amber-700'"
              role="note">
              <svg class="w-4 h-4 shrink-0 mt-0.5" :class="t.amberText"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>URL Match is set to <strong>{{ urlMatchType === 'urlPattern' ? 'URL Regex' : 'Path Regex' }}</strong>, so the URL below was synthesised from your pattern as a best-effort sample. Adjust it if the resolved value doesn't fit your matcher.</span>
            </p>
            <pre
              class="rounded-lg p-3 overflow-x-auto max-h-[40vh] overflow-y-auto text-xs font-mono leading-relaxed whitespace-pre"
              :class="isDark ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-700'"
            >{{ curlCommand }}</pre>
          </div>
        </div>

        <div class="flex flex-col gap-2 [&_button]:cursor-pointer [&_button:disabled]:cursor-not-allowed">
          <BaseButton
            :description="isEditMode ? 'Update Mock' : 'Create Mock'"
            :color="BaseButtonEnum.GREEN"
            :is-loading="isSubmitting"
            :disabled="isSubmitting || validationIssues.length > 0"
            @click="handleSubmit"
          />
          <p v-if="validationIssues.length > 0" class="text-xs"
            :class="t.amberTextStrong">
            Fix {{ validationIssues.length }} issue{{ validationIssues.length === 1 ? '' : 's' }} above to {{ isEditMode ? 'update' : 'create' }} the mock.
          </p>
          <p v-else-if="activeAdvancedCount > 0" class="text-xs" :class="t.dimTextAlt">
            {{ activeAdvancedCount }} advanced feature{{ activeAdvancedCount > 1 ? 's' : '' }} enabled
          </p>
        </div>

        <!--
          Sidebar slot for per-mock actions (Logs / Stub / cURL / Clone /
          Move / Export / Delete). Lives right under the Update / Create
          button so the action bar is colocated with the primary CTA.
          Filled by EditMockView; CreateMockView leaves it empty since
          there is no mock to act on yet.
        -->
        <slot name="sidebar-actions" />

        <!--
          WireMock stub status panel.

          Hidden when the stub already exists ('exists') — the
          MockActions bar above already gives the user "Stub" /
          "Logs" affordances and the confirmation card is just
          redundant chrome. Still rendered for missing / creating /
          error / loading because each of those carries an actionable
          message or CTA (push-to-WireMock, retry probe, etc.).
        -->
        <div
          v-if="isEditMode && stubStatus !== 'idle' && stubStatus !== 'exists'"
          class="rounded-xl border p-4 transition-colors"
          :class="sectionClasses"
        >
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-semibold" :class="t.primaryTextSoft">
              WireMock stub
            </h3>
            <button
              v-if="stubStatus !== 'loading' && stubStatus !== 'creating'"
              type="button"
              @click="refreshStubStatus"
              class="text-xs font-medium cursor-pointer transition-colors"
              :class="isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'"
            >
              Refresh
            </button>
          </div>

          <div
            v-if="stubStatus === 'loading'"
            class="flex items-center gap-2 text-xs"
            :class="t.dimTextAlt"
          >
            Checking WireMock…
          </div>

          <template v-else-if="stubStatus === 'missing'">
            <p class="text-xs mb-3" :class="t.amberTextStrong">
              No matching stub on WireMock. Click below to push this mock to WireMock.
            </p>
            <button
              type="button"
              @click="handleCreateStub"
              class="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer border"
              :class="isDark
                ? 'text-amber-300 border-amber-500/40 hover:bg-amber-500/10'
                : 'text-amber-700 border-amber-300 hover:bg-amber-50'"
            >
              click to create
            </button>
          </template>

          <button
            v-else-if="stubStatus === 'creating'"
            type="button"
            disabled
            class="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium cursor-not-allowed opacity-70 border"
            :class="isDark
              ? 'text-amber-300 border-amber-500/40'
              : 'text-amber-700 border-amber-300'"
          >
            Creating…
          </button>

          <div v-else-if="stubStatus === 'error'" class="text-xs">
            <p :class="t.amberTextStrong">
              Couldn't reach WireMock to check stub status.
            </p>
            <p
              v-if="stubErrorMsg"
              class="mt-1 break-words"
              :class="t.dimTextAlt"
            >
              {{ stubErrorMsg }}
            </p>
          </div>
        </div>
      </aside>
    </div>
    </template>
  </div>
</template>
