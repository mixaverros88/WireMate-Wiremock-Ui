<template>
  <div class="min-h-screen" :class="t.pageBg">
    <div class="pt-8">
      <!-- Shared page header from mgv-backoffice. Pass the page-specific
           icon through the `icon` slot and the action buttons through
           `actions`. -->
      <BasePageHeader
        title="Logs"
        subtitle="View all captured HTTP requests from WireMock"
        icon-color="sky"
      >
        <template #icon="{ iconClass }">
          <DocumentTextIcon class="w-5 h-5" :class="iconClass" />
        </template>
        <template #actions>
          <!-- Refresh — labelled bordered button, kept visually consistent
               with the equivalent affordance in NotificationsView so the
               page-level refresh icon never changes shape between tabs. -->
          <BaseToolbarButton
            label="Refresh"
            :disabled="isLoading"
            title="Refresh"
            @click="handleRefresh"
          >
            <template #icon="{ iconClass }">
              <ArrowPathIcon :class="[iconClass, isLoading ? 'animate-spin text-emerald-500' : '']" />
            </template>
          </BaseToolbarButton>
          <!-- Delete-all wipes the WireMock request journal in one shot
               (DELETE /__admin/requests). Disabled when nothing is
               loaded so the user can't fire a no-op against a possibly-
               down admin port. Confirms before destroying the journal. -->
          <BaseToolbarButton
            variant="danger"
            label="Delete All"
            :disabled="isDeletingAll || requests.length === 0"
            title="Delete all requests"
            @click="openDeleteAllModal"
          >
            <template #icon="{ iconClass }">
              <TrashIcon :class="[iconClass, { 'animate-pulse': isDeletingAll }]" />
            </template>
          </BaseToolbarButton>
        </template>
      </BasePageHeader>
    </div>

    <!-- Main Content -->
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">


      <!-- Analytics Graphs -->
      <div v-if="requests.length > 0" class="mb-8">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <h2 :class="t.primaryText" class="text-lg font-semibold">
              Analytics
            </h2>
            <span
              v-if="isAnyInputSet"
              class="px-2 py-0.5 text-xs font-medium rounded-full"
              :class="isDark ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'"
              title="Charts and counts below reflect the current search/filter"
            >
              Filtered
            </span>
          </div>
          <button
            type="button"
            @click="showGraphs = !showGraphs"
            :class="isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-800'"
            class="text-sm font-medium transition-colors duration-300 ease-in-out cursor-pointer"
          >
            {{ showGraphs ? 'Hide Charts' : 'Show Charts' }}
          </button>
        </div>
        <!-- Matched / Unmatched Stats — counts reflect the currently
             filtered set (the client-side `requests` computed). -->
        <div v-if="showGraphs && (matchedCount !== null || unmatchedCount !== null)" class="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          <div class="border rounded-lg p-4 text-center"
            :class="isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'">
            <p :class="t.dimTextAlt" class="text-xs font-semibold uppercase tracking-wide mb-1">Total</p>
            <p class="text-2xl font-bold" :class="isDark ? 'text-emerald-400' : 'text-emerald-600'">{{ totalRequests }}</p>
          </div>
          <div class="border rounded-lg p-4 text-center"
            :class="isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'">
            <p :class="t.dimTextAlt" class="text-xs font-semibold uppercase tracking-wide mb-1">Matched</p>
            <p class="text-2xl font-bold" :class="isDark ? 'text-blue-400' : 'text-blue-600'">{{ matchedCount ?? '—' }}</p>
          </div>
          <div class="border rounded-lg p-4 text-center"
            :class="isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'">
            <p :class="t.dimTextAlt" class="text-xs font-semibold uppercase tracking-wide mb-1">Unmatched</p>
            <p class="text-2xl font-bold" :class="unmatchedCount && unmatchedCount > 0 ? (t.amberText) : (t.mutedText)">{{ unmatchedCount ?? '—' }}</p>
          </div>
        </div>

        <div v-if="showGraphs" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
          <!-- Methods Distribution -->
          <div class="border rounded-lg p-5"
            :class="isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'">
            <h3 :class="t.label" class="text-sm font-semibold uppercase tracking-wide mb-4">
              Methods Distribution
            </h3>
            <div class="h-56 flex items-center justify-center">
              <Doughnut :data="methodChartData" :options="doughnutOptions" />
            </div>
          </div>
          <!-- Status Codes Distribution -->
          <div class="border rounded-lg p-5"
            :class="isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'">
            <h3 :class="t.label" class="text-sm font-semibold uppercase tracking-wide mb-4">
              Status Codes
            </h3>
            <div class="h-56 flex items-center justify-center">
              <Doughnut :data="statusChartData" :options="doughnutOptions" />
            </div>
          </div>
          <!-- Timeline -->
          <div class="border rounded-lg p-5 lg:col-span-1 md:col-span-2"
            :class="isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'">
            <h3 :class="t.label" class="text-sm font-semibold uppercase tracking-wide mb-4">
              Requests Over Time
            </h3>
            <div class="h-56">
              <Bar :data="timelineChartData" :options="barOptions" />
            </div>
          </div>
        </div>
      </div>

      <!-- Unified Search & Filter Panel
           Merges the former "Search & Filter" quick row with the old
           "Advanced Search" collapsible into a single always-visible panel.

           Semantics: every input filters the already-loaded journal
           CLIENT-SIDE and live (no network call per keystroke).
             • URL match type 'contains' → substring; url/urlPath →
               exact; urlPattern/urlPathPattern → anchored regex.
             • Method, headers, query params, body patterns and Since all
               narrow the same in-memory list (see clientMatch). -->
      <div class="mb-8">
        <div class="border rounded-lg p-6 mb-6"
          :class="isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'">
          <div class="flex flex-col gap-5">
            <!-- Row 1: URL -->
            <div>
              <label :class="t.label" class="block text-xs font-semibold uppercase tracking-wide mb-2">
                URL
              </label>
              <!--
                Match-type dropdown + URL input always share a single
                row — no `flex-col` fallback, so even on narrow widths
                the dropdown sits directly to the left of the input
                rather than stacking above it. The input keeps its
                own `min-w-0` so flex doesn't blow the row out.
              -->
              <div class="flex flex-row gap-2">
                <!--
                  URL match selector — labels mirror the WireMock
                  /__admin/requests/find documentation 1:1 so users
                  recognise the field name they'd send in a raw curl:

                    contains          → client-side substring filter
                    url               → exact path + query string
                    urlPath           → path only (ignores query)
                    urlPattern        → regex on full URL incl. query
                    urlPathPattern    → regex on path only

                  Each value names how the URL is matched client-side
                  (see urlMatches / clientMatch).
                -->
                <div class="w-64 shrink-0">
                  <BaseDropdown
                    v-model="urlMatchType"
                    :options="URL_MATCH_OPTIONS"
                    size="sm"
                    aria-label="URL match type"
                  />
                </div>
                <input
                  v-model="urlValue"
                  type="text"
                  :placeholder="urlPlaceholder"
                  :class="t.input"
                  class="flex-1 min-w-0 px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-mono transition-colors"
                />
              </div>
            </div>

            <!-- Row 2: Method / Since — both applied client-side over the
                 loaded journal. Method is an exact (case-insensitive)
                 match; Since drops entries older than the picked instant
                 (see applySinceFilter). -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label :class="t.label" class="block text-xs font-semibold uppercase tracking-wide mb-2">
                  Method
                </label>
                <!--
                  Method dropdown — values match what WireMock's /find
                  accepts in the `method` field. "Any" is the empty
                  string (no `method` on the outgoing pattern);
                  selecting "ANY" explicitly sends `method: "ANY"` so
                  the request mirrors the curl in the WireMock
                  /requests/find docs.
                -->
                <BaseDropdown v-model="filterMethod" :options="METHOD_FILTER_OPTIONS"
                  size="sm" aria-label="Method filter" />
              </div>
              <div>
                <label :class="t.label" class="block text-xs font-semibold uppercase tracking-wide mb-2">
                  Since
                </label>
                <BaseDateTimePicker
                  v-model="sinceFilter"
                  model-type="yyyy-MM-dd'T'HH:mm"
                  class="w-full"
                  :aria-labels="{ input: 'Since' }"
                  title="Filters the loaded journal client-side: drops requests logged before the picked instant."
                />
              </div>
            </div>

            <!-- Row 3: Headers -->
            <div>
              <div class="flex items-center justify-between mb-2">
                <label :class="t.label" class="block text-xs font-semibold uppercase tracking-wide">
                  Headers
                </label>
                <BaseChipButton @click="addHeaderFilter">+ Add Header</BaseChipButton>
              </div>
              <div v-for="(h, idx) in headers" :key="h.id" class="mb-2">
                <div class="flex flex-row items-center gap-2">
                  <input
                    v-model="h.key"
                    type="text"
                    placeholder="Header name *"
                    :class="[
                      headerKeyInvalid(h)
                        ? (isDark ? 'bg-gray-700 border-red-500 text-white placeholder-gray-400 ring-1 ring-red-500/30' : 'bg-gray-50 border-red-400 text-gray-900 placeholder-gray-500 ring-1 ring-red-400/30')
                        : (t.inputWithPlaceholder),
                    ]"
                    class="px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-mono w-40"
                  />
                  <div class="w-32 shrink-0">
                    <BaseDropdown v-model="h.matchType" :options="MATCH_TYPE_OPTIONS"
                      size="sm" aria-label="Header match type" />
                  </div>
                  <input
                    v-model="h.value"
                    type="text"
                    placeholder="Value *"
                    :class="[
                      headerValueInvalid(h)
                        ? (isDark ? 'bg-gray-700 border-red-500 text-white placeholder-gray-400 ring-1 ring-red-500/30' : 'bg-gray-50 border-red-400 text-gray-900 placeholder-gray-500 ring-1 ring-red-400/30')
                        : (t.inputWithPlaceholder),
                    ]"
                    class="flex-1 px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                  <BaseRemoveButton title="Remove" aria-label="Remove header filter"
                    @click="headers.splice(idx, 1)" />
                </div>
                <p v-if="headerRowError(h)" class="text-xs text-red-500 mt-1 ml-1">{{ headerRowError(h) }}</p>
              </div>
              <p v-if="headers.length === 0" :class="t.dimText" class="text-xs italic">
                No header filters
              </p>
            </div>

            <!-- Row 3.5: Query Parameters
                 WireMock's /find pattern accepts a `queryParameters`
                 field (same matcher shape as headers). We didn't expose
                 it before, which forced users to encode the query in
                 the URL Regex; now they can match individual params
                 directly. -->
            <div>
              <div class="flex items-center justify-between mb-2">
                <label :class="t.label" class="block text-xs font-semibold uppercase tracking-wide">
                  Query Parameters
                </label>
                <BaseChipButton @click="addQueryParamFilter">+ Add Query Param</BaseChipButton>
              </div>
              <div v-for="(q, idx) in queryParamFilters" :key="q.id" class="mb-2">
                <div class="flex flex-row items-center gap-2">
                  <input
                    v-model="q.key"
                    type="text"
                    placeholder="Param name *"
                    :class="[
                      headerKeyInvalid(q)
                        ? (isDark ? 'bg-gray-700 border-red-500 text-white placeholder-gray-400 ring-1 ring-red-500/30' : 'bg-gray-50 border-red-400 text-gray-900 placeholder-gray-500 ring-1 ring-red-400/30')
                        : (t.inputWithPlaceholder),
                    ]"
                    class="px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-mono w-40"
                  />
                  <div class="w-32 shrink-0">
                    <BaseDropdown v-model="q.matchType" :options="MATCH_TYPE_OPTIONS"
                      size="sm" aria-label="Query parameter match type" />
                  </div>
                  <input
                    v-model="q.value"
                    type="text"
                    placeholder="Value *"
                    :class="[
                      headerValueInvalid(q)
                        ? (isDark ? 'bg-gray-700 border-red-500 text-white placeholder-gray-400 ring-1 ring-red-500/30' : 'bg-gray-50 border-red-400 text-gray-900 placeholder-gray-500 ring-1 ring-red-400/30')
                        : (t.inputWithPlaceholder),
                    ]"
                    class="flex-1 px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                  <BaseRemoveButton title="Remove" aria-label="Remove query parameter filter"
                    @click="queryParamFilters.splice(idx, 1)" />
                </div>
                <p v-if="headerRowError(q)" class="text-xs text-red-500 mt-1 ml-1">{{ headerRowError(q) }}</p>
              </div>
              <p v-if="queryParamFilters.length === 0" :class="t.dimText" class="text-xs italic">
                No query parameter filters
              </p>
            </div>

            <!-- Row 4: Body Patterns -->
            <div>
              <div class="flex items-center justify-between mb-2">
                <label :class="t.label" class="block text-xs font-semibold uppercase tracking-wide">
                  Request Body Patterns
                </label>
                <BaseChipButton @click="addBodyPattern">+ Add Pattern</BaseChipButton>
              </div>
              <div v-for="(bp, idx) in bodyPatterns" :key="bp.id" class="mb-3">
                <div class="flex flex-row items-center gap-2">
                  <div class="w-48 shrink-0">
                    <BaseDropdown v-model="bp.type" :options="BODY_PATTERN_TYPE_OPTIONS"
                      size="sm" aria-label="Body pattern match type" />
                  </div>
                  <BaseRemoveButton class="self-start" title="Remove" aria-label="Remove body pattern"
                    @click="bodyPatterns.splice(idx, 1)" />
                </div>
                <div class="mt-2">
                  <textarea
                    v-model="bp.value"
                    rows="3"
                    :placeholder="getBodyPatternPlaceholder(bp.type)"
                    :class="[
                      bodyPatternError(bp)
                        ? (isDark ? 'bg-gray-700 border-red-500 text-white placeholder-gray-400 ring-1 ring-red-500/30' : 'bg-gray-50 border-red-400 text-gray-900 placeholder-gray-500 ring-1 ring-red-400/30')
                        : (t.inputWithPlaceholder),
                    ]"
                    class="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  ></textarea>
                  <p v-if="bodyPatternError(bp)" class="text-xs text-red-500 mt-1">{{ bodyPatternError(bp) }}</p>
                  <!-- Extra options for equalToJson -->
                  <div v-if="bp.type === 'equalToJson'" class="flex gap-4 mt-2">
                    <label class="flex items-center gap-1.5 text-xs cursor-pointer" :class="t.mutedText">
                      <input v-model="bp.ignoreArrayOrder" type="checkbox" class="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                      ignoreArrayOrder
                    </label>
                    <label class="flex items-center gap-1.5 text-xs cursor-pointer" :class="t.mutedText">
                      <input v-model="bp.ignoreExtraElements" type="checkbox" class="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                      ignoreExtraElements
                    </label>
                  </div>
                </div>
              </div>
              <p v-if="bodyPatterns.length === 0" :class="t.dimText" class="text-xs italic">
                No body pattern filters
              </p>
            </div>

            <!-- Action row — every input on this panel filters the
                 loaded journal live in the browser; there is no Search
                 button. This row holds Reset + the load indicator. -->
            <div class="flex flex-wrap items-center gap-3 pt-3 border-t" :class="t.border">
              <button
                type="button"
                :disabled="!isAnyInputSet"
                @click="resetSearch"
                :class="isDark
                  ? 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed'
                  : 'bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed'"
                class="px-4 py-2 border rounded-lg text-sm font-medium cursor-pointer transition-colors duration-300 ease-in-out"
                title="Clear all fields and reload the full journal"
              >
                Reset
              </button>
              <span
                v-if="isLoading"
                :class="t.emeraldText"
                class="inline-flex items-center gap-2 text-xs font-medium"
              >
                <ArrowPathIcon class="w-3.5 h-3.5 animate-spin" />
                Loading journal…
              </span>
              <span v-if="searchError" class="text-xs text-red-500 ml-2">{{ searchError }}</span>
            </div>
          </div>
        </div>

        <div :class="t.mutedText" class="text-sm">
          Showing {{ totalRequests }} request{{ totalRequests === 1 ? '' : 's' }} (filtered)
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="isLoading" class="flex justify-center items-center py-12">
        <BaseSpinner size="lg" color="emerald" />
      </div>

      <!-- Empty State -->
      <div v-else-if="totalRequests === 0" :class="t.card" class="border rounded-lg p-12 text-center">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <h3 :class="t.primaryText" class="mt-4 text-lg font-medium">
          {{ isAnyInputSet ? 'No requests match your filters' : 'No requests captured' }}
        </h3>
        <p :class="t.mutedText" class="mt-2">
          {{ isAnyInputSet ? 'Try loosening your filters or pressing Reset' : 'Make some API requests to WireMock to see them here' }}
        </p>
      </div>

      <!-- Requests List -->
      <div v-else class="space-y-4">
        <div
          v-for="request in requests"
          :key="request.id"
          :class="isDark ? 'bg-gray-800 border-gray-700 hover:bg-gray-900' : 'bg-white border-gray-200 hover:bg-gray-100'"
          class="border rounded-lg p-6 hover:shadow-lg transition-all duration-300 ease-in-out cursor-pointer"
          @click="viewRequest(request)"
        >
          <!-- Request Header -->
          <div class="mb-4">
            <div class="flex items-center gap-2 mb-2">
              <span :class="getMethodBgColor(request.request.method)" class="px-2 py-1 rounded text-xs font-bold text-white">
                {{ request.request.method || 'ANY' }}
              </span>
              <span v-if="request.responseDefinition" :class="getStatusCodeColor(request.responseDefinition.status)" class="px-2 py-1 rounded text-xs font-bold text-white">
                {{ request.responseDefinition.status }}
              </span>
            </div>
            <p :class="t.mutedText" class="text-sm font-mono truncate break-all">
              {{ request.request.url }}
            </p>
          </div>

          <!-- Request Details -->
          <div :class="isDark ? 'bg-gray-900' : 'bg-gray-100'" class="rounded p-3">
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <p :class="t.subtleText" class="uppercase tracking-wide font-medium">Client IP</p>
                <p :class="t.label" class="font-mono mt-1">{{ request.request.clientIp }}</p>
              </div>
              <div>
                <p :class="t.subtleText" class="uppercase tracking-wide font-medium">Scheme</p>
                <p :class="t.label" class="font-mono mt-1">{{ request.request.scheme }}</p>
              </div>
              <div>
                <p :class="t.subtleText" class="uppercase tracking-wide font-medium">Host</p>
                <p :class="t.label" class="font-mono mt-1">{{ request.request.host }}</p>
              </div>
              <div>
                <p :class="t.subtleText" class="uppercase tracking-wide font-medium">Port</p>
                <p :class="t.label" class="font-mono mt-1">{{ request.request.port }}</p>
              </div>
              <div class="sm:col-span-2">
                <p :class="t.subtleText" class="uppercase tracking-wide font-medium">Logged</p>
                <p :class="t.label" class="mt-1">{{ fmtDate(request.request.loggedDate) }}</p>
              </div>
            </div>
          </div>

          <!--
            Action bar — labeled icon buttons styled like the mock-card
            action row in ProjectDetailView (icon + text, not bare icons).
            All use @click.stop so the wrapping card-click (viewRequest)
            doesn't fire alongside them. Each button is conditional:
              · Project / Edit WireMate / Stub render only when the request
                matched a WireMate-managed stub (metadata.projectId / id).
              · Delete renders only when the row carries a real WireMock id
                (GET /__admin/requests always provides one; defensive guard).
            The whole bar is hidden when none of the above apply so an
            empty bordered strip never renders.
          -->
          <div
            v-if="hasRowActions(request)"
            class="flex items-center flex-wrap gap-2 mt-4 pt-4 border-t"
            :class="t.border"
          >
            <RouterLink
              v-if="getMatchedProjectId(request)"
              :to="{ name: 'project', params: { id: getMatchedProjectId(request)! } }"
              @click.stop
              class="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              :class="isDark ? 'text-sky-400 hover:bg-sky-500/10' : 'text-sky-600 hover:bg-sky-50'"
              title="Open the WireMate project this stub belongs to"
            >
              <FolderIcon class="w-4 h-4" />
              Project
            </RouterLink>
            <BaseActionButton
              v-if="getEditableMockParams(request)"
              label="Edit WireMate"
              color="emerald"
              title="Open this stub in the WireMate mock editor"
              @click.stop="editMockFromRequest(request)"
            >
              <template #icon>
                <WireMateLogo :size="16" />
              </template>
            </BaseActionButton>
            <BaseActionButton
              v-if="getMatchedStubId(request)"
              label="Stub"
              color="indigo"
              title="Open the raw WireMock stub"
              @click.stop="viewMatchedStub(request)"
            >
              <template #icon="{ iconClass }">
                <CubeIcon :class="iconClass" />
              </template>
            </BaseActionButton>
            <BaseActionButton
              v-if="request.id && !request.id.startsWith('find-')"
              label="Delete"
              color="red"
              :disabled="deletingIds.has(request.id)"
              :aria-label="`Delete request ${request.request.url}`"
              title="Delete this request"
              @click.stop="openDeleteRequestModal(request)"
            >
              <template #icon="{ iconClass }">
                <TrashIcon :class="iconClass" />
              </template>
            </BaseActionButton>
          </div>
        </div>

      </div>
    </div>

    <!-- Detail Modal — receives the full LoggedRequest object so it can
         render without re-fetching (the page no longer calls
         GET /__admin/requests/{id}). -->
    <RequestDetailModal
      v-if="selectedRequest"
      :request="selectedRequest"
      @close="selectedRequest = null"
    />

    <!-- Delete-all confirmation. Uses the same ConfirmModal component the
         rest of the app uses for destructive actions. The modal's @cancel
         is also fired on Esc/backdrop-click; we no-op while a delete is in
         flight so the user can't dismiss the modal mid-request. -->
    <BaseConfirmModal
      v-if="showDeleteAllModal"
      :title="`Delete all ${totalRequests} request${totalRequests === 1 ? '' : 's'}?`"
      :message="`This will clear WireMock's request journal entirely. This action cannot be undone.`"
      confirm-text="Yes, delete all"
      cancel-text="Cancel"
      submitting-text="Deleting..."
      variant="danger"
      :submitting="isDeletingAll"
      @confirm="confirmDeleteAll"
      @cancel="closeDeleteAllModal"
    />

    <!-- Per-row delete confirmation. Mirrors the Delete-All modal pattern but
         scoped to a single LoggedRequest. The trash icon on each card now
         opens this modal instead of firing DELETE /__admin/requests/{id}
         directly, so the user always gets an explicit confirmation step. -->
    <BaseConfirmModal
      v-if="requestToDelete"
      :title="`Delete this request?`"
      :message="deleteRequestMessage"
      confirm-text="Yes, delete"
      cancel-text="Cancel"
      submitting-text="Deleting..."
      variant="danger"
      :submitting="isDeletingSingle"
      @confirm="confirmDeleteRequest"
      @cancel="closeDeleteRequestModal"
    />

    <!-- Toast Notifications -->
    <BaseToast
      v-if="showToast"
      :description="toastMessage"
      :mode="toastType"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { BaseActionButton, BaseChipButton, BaseConfirmModal, BaseDateTimePicker, BaseDropdown, BasePageHeader, BaseRemoveButton, BaseSpinner, BaseToast, BaseToastEnum, BaseToolbarButton, fmtDate, methodBadgeSolid, rowKeyMissing, rowValueMissing, statusBadgeSolid, useTheme, useThemeClasses, useToast, type DropdownOption } from 'mgv-backoffice'
import { getAllRequests, deleteAllRequests, deleteRequest } from '../services/requestJournalService'
// Note: removeRequestsByPattern was previously imported here for the
// "Remove matching" toolbar button, which has been removed in favour of
// the per-row delete + Delete All affordances.
import RequestDetailModal from '../components/RequestDetailModal.vue'
import type { LoggedRequest } from '../types/requestJournal'
import {
  ArrowPathIcon,
  TrashIcon,
  FolderIcon,
  CubeIcon,
  DocumentTextIcon,
} from '@heroicons/vue/24/outline'
import WireMateLogo from '../components/WireMateLogo.vue'

import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
} from 'chart.js'
import { Doughnut, Bar } from 'vue-chartjs'

ChartJS.register(ArcElement, Tooltip, Legend, BarElement, CategoryScale, LinearScale)

// Router & Theme
const { isDark } = useTheme()
const t = useThemeClasses()
const route = useRoute()
const router = useRouter()

// ── State ──────────────────────────────────────────────────────────────
//
// The Logs page fetches the WHOLE journal once via GET /__admin/requests
// (rich ServeEvents: id, request, response, match result, stub, timing)
// and does ALL searching/filtering CLIENT-SIDE over that list. There is
// no server-side search — POST /__admin/requests/find was removed because
// it returns only the bare inbound request (no id/response/match/stub),
// which broke per-row delete and the status / matched badges. `requests`
// (computed, below) is the filtered view every chart/list/count reads.
//
// `contains` is a URL match type shorthand for a case-sensitive substring
// test; the regex match types compile to an anchored RegExp — all matched
// in `clientMatch` below.

// Full journal as returned by GET /__admin/requests (unfiltered source).
const allRequests = ref<LoggedRequest[]>([])
const isLoading = ref(false)
const selectedRequest = ref<LoggedRequest | null>(null)
const showGraphs = ref(true)
const { showToast, toastMessage, toastType, showToastMessage } = useToast()

// URL search — single input; the match type names how the value is
// matched. `contains` is a UX shorthand for a substring test (see
// clientMatch).
type UrlMatchType = 'contains' | 'url' | 'urlPath' | 'urlPattern' | 'urlPathPattern'
function parseUrlMatchType(raw: unknown): UrlMatchType {
  if (raw === 'url' || raw === 'urlPath' || raw === 'urlPattern' || raw === 'urlPathPattern') {
    return raw
  }
  return 'contains'
}
const urlMatchType = ref<UrlMatchType>(parseUrlMatchType(route.query.urlMatch))
const urlValue = ref(typeof route.query.search === 'string' ? route.query.search : '')

// URL match-type dropdown rows — labels mirror the WireMock
// /__admin/requests/find documentation 1:1 so users recognise the field
// name they'd send in a raw curl; each row carries its own tooltip
// explaining how the value is applied.
const URL_MATCH_OPTIONS: DropdownOption[] = [
  {
    value: 'contains',
    label: 'contains — substring (client)',
    title: 'Filters the already-loaded journal locally by substring — nothing is sent to WireMock.',
  },
  {
    value: 'url',
    label: 'url — exact path + query',
    title: 'Sent as a WireMock /find matcher on Search: exact match on path + query string.',
  },
  {
    value: 'urlPath',
    label: 'urlPath — path only (ignore query)',
    title: 'Sent as a WireMock /find matcher on Search: exact match on the path, query ignored.',
  },
  {
    value: 'urlPattern',
    label: 'urlPattern — regex (full URL)',
    title: 'Sent as a WireMock /find matcher on Search: regex against the full URL incl. query.',
  },
  {
    value: 'urlPathPattern',
    label: 'urlPathPattern — regex (path only)',
    title: 'Sent as a WireMock /find matcher on Search: regex against the path only.',
  },
]

// Method filter — values match what WireMock's /find accepts in the
// `method` field: '' sends no method, 'ANY' sends it explicitly.
const METHOD_FILTER_OPTIONS: DropdownOption[] = [
  { value: '', label: 'Any (no filter)' },
  { value: 'ANY', label: 'ANY (explicit)' },
  ...['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].map((m) => ({ value: m, label: m })),
]

// Shared matcher rows (headers + query params).
const MATCH_TYPE_OPTIONS: DropdownOption[] = [
  { value: 'equalTo', label: 'equalTo' },
  { value: 'contains', label: 'contains' },
  { value: 'matches', label: 'matches (regex)' },
]

const BODY_PATTERN_TYPE_OPTIONS: DropdownOption[] = [
  { value: 'equalToJson', label: 'equalToJson' },
  { value: 'matchesJsonPath', label: 'matchesJsonPath' },
  { value: 'contains', label: 'contains' },
  { value: 'matches', label: 'matches (regex)' },
  { value: 'equalTo', label: 'equalTo (exact)' },
]

// Method + since are applied client-side in the `requests` computed.
const filterMethod = ref(typeof route.query.method === 'string' ? route.query.method : '')
const sinceFilter = ref('')

// Pattern inputs (all matched client-side in clientMatch)
// Stable per-row id so Vue's v-for can track rows across `splice()` deletions
// without reusing DOM nodes by position (which would shift form values into
// the wrong cells when a row in the middle is removed).
interface HeaderFilter {
  id: string
  key: string
  matchType: 'equalTo' | 'contains' | 'matches'
  value: string
}
interface BodyPatternFilter {
  id: string
  type: 'equalToJson' | 'matchesJsonPath' | 'contains' | 'matches' | 'equalTo'
  value: string
  ignoreArrayOrder: boolean
  ignoreExtraElements: boolean
}

function newRowId(): string {
  // `crypto.randomUUID` is available in all evergreen browsers and Node 19+
  // (which Vite's dev server runs). Falls back to a counter-based id when
  // the API isn't available (e.g. very old browsers).
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `row-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
const headers = ref<HeaderFilter[]>([])
// Query parameters share HeaderFilter's shape (name + matcher + value)
// because WireMock's RequestPattern accepts the same matcher object for
// both. Reusing the type lets us reuse headerKeyInvalid/headerValueInvalid
// /headerRowError helpers for validation messages.
const queryParamFilters = ref<HeaderFilter[]>([])
const bodyPatterns = ref<BodyPatternFilter[]>([])
const searchError = ref('')

// ── Computed ───────────────────────────────────────────────────────────

const totalRequests = computed(() => requests.value.length)

// True when the user has filled in anything at all — controls the Reset
// button's enabled state and the empty-state copy.
const isAnyInputSet = computed(() => {
  return urlValue.value.trim() !== ''
    || filterMethod.value !== ''
    || sinceFilter.value !== ''
    || headers.value.some(h => h.key || h.value)
    || queryParamFilters.value.some(q => q.key || q.value)
    || bodyPatterns.value.some(bp => bp.value.trim())
})

// Placeholders mirror the WireMock /requests/find docs so the form
// reads as a one-to-one analogue of the equivalent curl call:
//   url             → /api/orders?status=open  (exact path + query)
//   urlPath         → /api/orders              (path only, ignore query)
//   urlPattern      → /api/orders.*            (regex on full URL)
//   urlPathPattern  → /api/orders/[0-9]+       (regex on path only)
const urlPlaceholder = computed(() => {
  switch (urlMatchType.value) {
    case 'url': return '/api/orders?status=open'
    case 'urlPath': return '/api/orders'
    case 'urlPattern': return '/api/orders.*'
    case 'urlPathPattern': return '/api/orders/[0-9]+'
    case 'contains':
    default:
      return 'Search by URL…'
  }
})

// Matched / unmatched counts are derived purely from the loaded list.
// Entries where `wasMatched` is absent (e.g. the flat
// LoggedRequestDetail shape returned by /find on some WireMock
// builds) are treated as unknown, so the tile shows "—" instead of
// a misleading zero.
function countByMatch(list: LoggedRequest[], matched: boolean): number | null {
  const withInfo = list.filter(r => r.wasMatched !== undefined)
  if (withInfo.length === 0) return null
  return withInfo.filter(r => r.wasMatched === matched).length
}

const matchedCount = computed<number | null>(() => countByMatch(requests.value, true))
const unmatchedCount = computed<number | null>(() => countByMatch(requests.value, false))

// ---- Chart Data ----

const METHOD_COLORS: Record<string, string> = {
  GET: '#2563eb',
  POST: '#059669',
  PUT: '#d97706',
  DELETE: '#dc2626',
  PATCH: '#9333ea',
  HEAD: '#6b7280',
  OPTIONS: '#0891b2',
}

const methodChartData = computed(() => {
  const counts: Record<string, number> = {}
  for (const req of requests.value) {
    const m = req.request.method || 'OTHER'
    counts[m] = (counts[m] || 0) + 1
  }
  const labels = Object.keys(counts)
  return {
    labels,
    datasets: [{
      data: labels.map(l => counts[l]),
      backgroundColor: labels.map(l => METHOD_COLORS[l] || '#6b7280'),
      borderWidth: 0,
    }],
  }
})

const statusChartData = computed(() => {
  const buckets: Record<string, number> = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, 'N/A': 0 }
  for (const req of requests.value) {
    const status = req.responseDefinition?.status
    if (!status) { buckets['N/A']++; continue }
    if (status < 300) buckets['2xx']++
    else if (status < 400) buckets['3xx']++
    else if (status < 500) buckets['4xx']++
    else buckets['5xx']++
  }
  const filtered = Object.entries(buckets).filter(([, v]) => v > 0)
  const colorMap: Record<string, string> = {
    '2xx': '#059669',
    '3xx': '#2563eb',
    '4xx': '#d97706',
    '5xx': '#dc2626',
    'N/A': '#6b7280',
  }
  return {
    labels: filtered.map(([k]) => k),
    datasets: [{
      data: filtered.map(([, v]) => v),
      backgroundColor: filtered.map(([k]) => colorMap[k]),
      borderWidth: 0,
    }],
  }
})

const timelineChartData = computed(() => {
  // Group requests into time buckets (respects active search/filter)
  const sorted = [...requests.value]
    .filter(r => r.request.loggedDate)
    .sort((a, b) => new Date(a.request.loggedDate).getTime() - new Date(b.request.loggedDate).getTime())

  if (sorted.length === 0) {
    return { labels: [], datasets: [{ label: 'Requests', data: [], backgroundColor: '#059669' }] }
  }

  const first = new Date(sorted[0].request.loggedDate).getTime()
  const last = new Date(sorted[sorted.length - 1].request.loggedDate).getTime()
  const range = last - first

  // Decide bucket size based on time range
  let bucketMs: number
  let formatLabel: (d: Date) => string

  if (range < 1000 * 60 * 60) {
    // Less than 1 hour → bucket per minute
    bucketMs = 1000 * 60
    formatLabel = (d: Date) => `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  } else if (range < 1000 * 60 * 60 * 24) {
    // Less than 1 day → bucket per hour
    bucketMs = 1000 * 60 * 60
    formatLabel = (d: Date) => `${d.getHours().toString().padStart(2, '0')}:00`
  } else if (range < 1000 * 60 * 60 * 24 * 30) {
    // Less than 30 days → bucket per day
    bucketMs = 1000 * 60 * 60 * 24
    formatLabel = (d: Date) => `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`
  } else {
    // More → bucket per week
    bucketMs = 1000 * 60 * 60 * 24 * 7
    formatLabel = (d: Date) => `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`
  }

  const buckets = new Map<number, number>()
  for (const req of sorted) {
    const t = new Date(req.request.loggedDate).getTime()
    const key = Math.floor(t / bucketMs) * bucketMs
    buckets.set(key, (buckets.get(key) || 0) + 1)
  }

  // Fill in gaps
  const bucketKeys = Array.from(buckets.keys()).sort((a, b) => a - b)
  if (bucketKeys.length > 1) {
    const start = bucketKeys[0]
    const end = bucketKeys[bucketKeys.length - 1]
    for (let t = start; t <= end; t += bucketMs) {
      if (!buckets.has(t)) buckets.set(t, 0)
    }
  }

  const sortedBuckets = Array.from(buckets.entries()).sort(([a], [b]) => a - b)
  // Cap at 30 buckets to keep the chart readable
  const display = sortedBuckets.length > 30
    ? sortedBuckets.slice(sortedBuckets.length - 30)
    : sortedBuckets

  return {
    labels: display.map(([ts]) => formatLabel(new Date(ts))),
    datasets: [{
      label: 'Requests',
      data: display.map(([, count]) => count),
      backgroundColor: '#059669',
      borderRadius: 4,
    }],
  }
})

const doughnutOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels: {
        color: isDark.value ? '#d1d5db' : '#374151',
        padding: 12,
        font: { size: 11 },
      },
    },
  },
}))

const barOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
  },
  scales: {
    x: {
      ticks: {
        color: isDark.value ? '#9ca3af' : '#6b7280',
        font: { size: 10 },
        maxRotation: 45,
      },
      grid: { display: false },
    },
    y: {
      beginAtZero: true,
      ticks: {
        color: isDark.value ? '#9ca3af' : '#6b7280',
        stepSize: 1,
      },
      grid: {
        color: isDark.value ? '#374151' : '#e5e7eb',
      },
    },
  },
}))

// ── Methods ────────────────────────────────────────────────────────────

const getMethodBgColor = methodBadgeSolid
const getStatusCodeColor = statusBadgeSolid

async function handleRefresh() {
  // Re-fetch the full journal; the active filters re-apply client-side
  // via the `requests` computed.
  await loadRequests()
}

// ── Journal mutations ──────────────────────────────────────────────────
//
// "Delete All" wipes WireMock's request journal in a single shot via
// DELETE /__admin/requests. Per-row delete uses
// DELETE /__admin/requests/{id}. Both update local state on success so the
// user doesn't need to wait for a refetch.
const isDeletingAll = ref(false)
const deletingIds = ref<Set<string>>(new Set())
// Modal-driven confirmation for Delete All. Mirrors the ConfirmModal usage
// elsewhere on the page (per-row delete in ProjectDetailView, etc.) — the
// page-wide modal is opened by setting `showDeleteAllModal` true; the
// modal's @confirm/@cancel events drive the rest.
const showDeleteAllModal = ref(false)

function openDeleteAllModal() {
  if (requests.value.length === 0) return
  showDeleteAllModal.value = true
}

function closeDeleteAllModal() {
  if (isDeletingAll.value) return
  showDeleteAllModal.value = false
}

async function confirmDeleteAll() {
  isDeletingAll.value = true
  try {
    await deleteAllRequests()
    allRequests.value = []
    showToastMessage('Request journal cleared', BaseToastEnum.SUCCESS)
    showDeleteAllModal.value = false
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to delete requests'
    showToastMessage(message, BaseToastEnum.ERROR)
  } finally {
    isDeletingAll.value = false
  }
}

// Per-row delete is two-step: the trash icon opens a confirmation modal,
// then the modal's @confirm fires the actual DELETE. This mirrors how the
// rest of the app guards destructive actions (Delete-All here, project /
// mock deletions in ProjectsView and ProjectDetailView) so the user can't
// nuke an interesting request entry by misclick.
const requestToDelete = ref<LoggedRequest | null>(null)
const isDeletingSingle = ref(false)

const deleteRequestMessage = computed(() => {
  const req = requestToDelete.value
  if (!req) return ''
  const method = req.request.method || 'ANY'
  const url = req.request.url || ''
  return `${method} ${url} will be removed from the WireMock request journal. This action cannot be undone.`
})

function openDeleteRequestModal(req: LoggedRequest) {
  if (!req.id) return
  requestToDelete.value = req
}

function closeDeleteRequestModal() {
  // Don't allow dismissing while a delete is in flight so the modal can't
  // be torn down mid-request and lose the loading affordance.
  if (isDeletingSingle.value) return
  requestToDelete.value = null
}

async function confirmDeleteRequest() {
  const req = requestToDelete.value
  if (!req || !req.id) return
  // Track per-row pending state so the icon can spin without blocking the
  // rest of the list. Use a Set rather than a single ref so concurrent
  // deletes don't fight over the loading flag.
  deletingIds.value.add(req.id)
  // Trigger reactivity (Set mutations alone don't notify Vue).
  deletingIds.value = new Set(deletingIds.value)
  isDeletingSingle.value = true
  try {
    await deleteRequest(req.id)
    allRequests.value = allRequests.value.filter(r => r.id !== req.id)
    showToastMessage('Request deleted', BaseToastEnum.SUCCESS)
    requestToDelete.value = null
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to delete request'
    showToastMessage(message, BaseToastEnum.ERROR)
  } finally {
    deletingIds.value.delete(req.id)
    deletingIds.value = new Set(deletingIds.value)
    isDeletingSingle.value = false
  }
}

// Fetches the ENTIRE request journal via GET /__admin/requests and stores
// it in `allRequests`. All search/filter criteria are then applied
// client-side by the `requests` computed — there is no server-side search
// any more. GET returns rich ServeEvents with the real WireMock id
// (needed for per-row delete), the response, the match result, the matched
// stub and timing — none of which the old /find endpoint returned. Called
// on mount and by Refresh / Reset.
async function loadRequests() {
  isLoading.value = true
  try {
    const response = await getAllRequests()
    allRequests.value = response.requests
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load requests'
    showToastMessage(message, BaseToastEnum.ERROR)
  } finally {
    isLoading.value = false
  }
}

// `sinceFilter` arrives as a `YYYY-MM-DDTHH:mm` string (no timezone). We
// parse it through the local timezone (matching what the user picked in
// the picker) and re-emit as ISO-8601 UTC for the WireMock query param.
// Returns null when the input is empty or unparseable so the call
// degrades cleanly to "no since".
const sinceIsoForServer = computed<string | null>(() => {
  if (!sinceFilter.value) return null
  const t = new Date(sinceFilter.value).getTime()
  if (Number.isNaN(t)) return null
  return new Date(t).toISOString()
})

// Client-side `since` trim for the search path. POST /find can't filter by
// date, so once it returns we drop anything older than the picked instant.
// Entries with no loggedDate are kept rather than silently hidden.
function applySinceFilter(list: LoggedRequest[]): LoggedRequest[] {
  const iso = sinceIsoForServer.value
  if (!iso) return list
  const cutoff = new Date(iso).getTime()
  return list.filter(r => {
    const d = r.request.loggedDate
    if (!d) return true
    return new Date(d).getTime() >= cutoff
  })
}

// ── Header / Body Pattern helpers ──────────────────────────────────────

function addHeaderFilter() {
  headers.value.push({ id: newRowId(), key: '', matchType: 'equalTo', value: '' })
}

function addQueryParamFilter() {
  queryParamFilters.value.push({ id: newRowId(), key: '', matchType: 'equalTo', value: '' })
}

function addBodyPattern() {
  bodyPatterns.value.push({ id: newRowId(), type: 'equalToJson', value: '', ignoreArrayOrder: true, ignoreExtraElements: true })
}

// Shared lib validators for the key/value filter rows.
const headerKeyInvalid = (h: HeaderFilter): boolean => rowKeyMissing(h)
const headerValueInvalid = (h: HeaderFilter): boolean => rowValueMissing(h)

function headerRowError(h: HeaderFilter): string {
  if (headerKeyInvalid(h)) return 'Header name is required when a value is provided'
  if (headerValueInvalid(h)) return 'Header value is required when a name is provided'
  return ''
}

function bodyPatternError(bp: BodyPatternFilter): string {
  const value = bp.value.trim()
  if (!value) return ''
  if (bp.type === 'equalToJson') {
    try {
      JSON.parse(value)
    } catch (e) {
      return `Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}`
    }
  } else if (bp.type === 'matchesJsonPath') {
    if (!value.startsWith('$')) {
      return 'JSONPath expressions should start with $ (e.g. $.customerId)'
    }
  } else if (bp.type === 'matches') {
    try {
      new RegExp(value)
    } catch (e) {
      return `Invalid regex: ${e instanceof Error ? e.message : 'parse error'}`
    }
  }
  return ''
}

function getBodyPatternPlaceholder(type: string): string {
  switch (type) {
    case 'equalToJson': return '{ "customerId": "12345" }'
    case 'matchesJsonPath': return '$.customerId'
    case 'contains': return 'some text in the body'
    case 'matches': return '.*customerId.*'
    case 'equalTo': return 'exact body content'
    default: return ''
  }
}

// ── Client-side search / filter ─────────────────────────────────────────
//
// Everything below narrows `allRequests` in the browser. Each helper
// returns true when its slice of the criteria is satisfied (or when that
// criterion is empty); `clientMatch` ANDs them together.

// Anchored regex test — WireMock's url/body regex matchers are
// whole-string matches. An invalid regex is treated as "no constraint" so
// a half-typed pattern shows everything instead of throwing.
function anchoredRegexTest(pattern: string, value: string): boolean {
  let re: RegExp
  try {
    re = new RegExp(`^(?:${pattern})$`)
  } catch {
    return true
  }
  return re.test(value)
}

function valueMatches(
  matchType: 'equalTo' | 'contains' | 'matches',
  actual: string,
  expected: string,
): boolean {
  switch (matchType) {
    case 'equalTo': return actual === expected
    case 'contains': return actual.includes(expected)
    case 'matches':
      try { return new RegExp(`^(?:${expected})$`).test(actual) } catch { return false }
  }
  return false
}

function urlMatches(req: LoggedRequest): boolean {
  const v = urlValue.value.trim()
  if (!v) return true
  const fullUrl = req.request.url || ''
  const path = fullUrl.split('?')[0]
  switch (urlMatchType.value) {
    case 'url': return fullUrl === v
    case 'urlPath': return path === v
    case 'urlPattern': return anchoredRegexTest(v, fullUrl)
    case 'urlPathPattern': return anchoredRegexTest(v, path)
    case 'contains':
    default: return fullUrl.includes(v)
  }
}

function methodMatches(req: LoggedRequest): boolean {
  if (!filterMethod.value) return true
  return (req.request.method || '').toUpperCase() === filterMethod.value.toUpperCase()
}

function headersMatch(req: LoggedRequest): boolean {
  const valid = headers.value.filter(h => h.key && h.value)
  if (valid.length === 0) return true
  // HTTP header names are case-insensitive — fold the request's headers to
  // lower-case keys for lookup.
  const actual: Record<string, string> = {}
  const src = (req.request.headers || {}) as Record<string, unknown>
  for (const k of Object.keys(src)) actual[k.toLowerCase()] = String(src[k])
  return valid.every(h => {
    const a = actual[h.key.toLowerCase()]
    return a !== undefined && valueMatches(h.matchType, a, h.value)
  })
}

function queryParamsMatch(req: LoggedRequest): boolean {
  const valid = queryParamFilters.value.filter(q => q.key && q.value)
  if (valid.length === 0) return true
  const qp = (req.request.queryParams || {}) as Record<string, unknown>
  return valid.every(q => {
    const entry = qp[q.key]
    if (entry === undefined) return false
    const values: string[] = Array.isArray(entry)
      ? entry.map(String)
      : (entry && typeof entry === 'object' && Array.isArray((entry as { values?: unknown[] }).values))
        ? (entry as { values: unknown[] }).values.map(String)
        : [String(entry)]
    return values.some(val => valueMatches(q.matchType, val, q.value))
  })
}

// Best-effort JSON deep match for `equalToJson`. `ignoreExtra` lets the
// actual object/array carry extra keys/elements; `ignoreOrder` matches
// array elements regardless of position.
function jsonDeepMatch(actual: unknown, expected: unknown, ignoreExtra: boolean, ignoreOrder: boolean): boolean {
  if (expected === null || typeof expected !== 'object') return actual === expected
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false
    if (ignoreOrder) {
      const used = new Array(actual.length).fill(false)
      const all = expected.every(ev => {
        const idx = actual.findIndex((av, i) => !used[i] && jsonDeepMatch(av, ev, ignoreExtra, ignoreOrder))
        if (idx === -1) return false
        used[idx] = true
        return true
      })
      return all && (ignoreExtra || actual.length === expected.length)
    }
    if (!ignoreExtra && actual.length !== expected.length) return false
    return expected.every((ev, i) => jsonDeepMatch(actual[i], ev, ignoreExtra, ignoreOrder))
  }
  if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) return false
  const ao = actual as Record<string, unknown>
  const eo = expected as Record<string, unknown>
  const eKeys = Object.keys(eo)
  if (!ignoreExtra && Object.keys(ao).length !== eKeys.length) return false
  return eKeys.every(k => k in ao && jsonDeepMatch(ao[k], eo[k], ignoreExtra, ignoreOrder))
}

// Minimal JSONPath existence check — supports dotted / bracket paths like
// `$.a.b`, `$.a[0].b`, `$['a'].b`. Advanced JSONPath (wildcards, filters)
// isn't supported client-side; such an expression simply won't match.
function jsonPathExists(bodyStr: string, path: string): boolean {
  let data: unknown
  try { data = JSON.parse(bodyStr) } catch { return false }
  const tokens = path.replace(/^\$\.?/, '').match(/[^.[\]]+/g) || []
  let cur: unknown = data
  for (const tok of tokens) {
    const key = tok.replace(/^['"]|['"]$/g, '')
    if (cur && typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[key]
    } else {
      return false
    }
    if (cur === undefined) return false
  }
  return cur !== undefined
}

function bodyMatches(req: LoggedRequest): boolean {
  const valid = bodyPatterns.value.filter(bp => bp.value.trim())
  if (valid.length === 0) return true
  const body = req.request.body || ''
  return valid.every(bp => {
    const v = bp.value.trim()
    switch (bp.type) {
      case 'equalTo': return body === v
      case 'contains': return body.includes(v)
      case 'matches': return anchoredRegexTest(v, body)
      case 'matchesJsonPath': return jsonPathExists(body, v)
      case 'equalToJson': {
        let expected: unknown
        try { expected = JSON.parse(v) } catch { return false }
        let actual: unknown
        try { actual = JSON.parse(body) } catch { return false }
        return jsonDeepMatch(actual, expected, bp.ignoreExtraElements, bp.ignoreArrayOrder)
      }
    }
    return false
  })
}

function clientMatch(req: LoggedRequest): boolean {
  return urlMatches(req)
    && methodMatches(req)
    && headersMatch(req)
    && queryParamsMatch(req)
    && bodyMatches(req)
}

// The on-screen list: the full journal narrowed by `since` + every active
// filter, recomputed reactively whenever a filter input or `allRequests`
// changes. Every chart / count / list on the page reads this.
const requests = computed<LoggedRequest[]>(() =>
  applySinceFilter(allRequests.value).filter(clientMatch),
)

function resetSearch() {
  urlMatchType.value = 'contains'
  urlValue.value = ''
  filterMethod.value = ''
  sinceFilter.value = ''
  headers.value = []
  queryParamFilters.value = []
  bodyPatterns.value = []
  searchError.value = ''
  const query: Record<string, string> = { ...route.query } as Record<string, string>
  delete query.search
  delete query.urlMatch
  delete query.method
  delete query.status
  router.replace({ query })
  loadRequests()
}

function viewRequest(req: LoggedRequest) {
  selectedRequest.value = req
}

function getEditableMockParams(req: LoggedRequest): { projectId: string; mockId: string } | null {
  const stub = req.stubMapping
  if (!stub?.id) return null
  const projectId = stub.metadata?.projectId
  if (typeof projectId !== 'string' || !projectId) return null
  return { projectId, mockId: stub.id }
}

// Project shortcut on the log card mirrors the /stubs page Project
// icon: pull `metadata.projectId` from the matched stub when present,
// returning null for unmatched requests or stubs added through the
// raw WireMock API without WireMate's tagging.
function getMatchedProjectId(req: LoggedRequest): string | null {
  const pid = req.stubMapping?.metadata?.projectId
  return typeof pid === 'string' && pid ? pid : null
}

// Raw WireMock stub id — used by the "Stub" (CubeIcon) shortcut to
// route into /stubs/:id, mirroring the Stub button on mock cards in
// ProjectDetailView. Returns null when the request didn't match any
// stub (or for the legacy flat shape that doesn't expose stubMapping).
function getMatchedStubId(req: LoggedRequest): string | null {
  const id = req.stubMapping?.id
  return typeof id === 'string' && id ? id : null
}

function viewMatchedStub(req: LoggedRequest) {
  const id = getMatchedStubId(req)
  if (!id) return
  router.push({ name: 'stub-detail', params: { id } })
}

// True when the request row has at least one action to show, so the
// bottom action bar (and its top border) only renders when populated.
function hasRowActions(req: LoggedRequest): boolean {
  return !!getMatchedProjectId(req)
    || !!getEditableMockParams(req)
    || !!getMatchedStubId(req)
    || !!(req.id && !req.id.startsWith('find-'))
}

function editMockFromRequest(req: LoggedRequest) {
  const params = getEditableMockParams(req)
  if (!params) return
  router.push({ name: 'edit-mock', params: { id: params.projectId, mockId: params.mockId } })
}

// Method is intentionally kept out of the URL query — it's local-only filter
// state, so reloading/sharing the URL never carries the method selection.
watch([urlValue, urlMatchType], ([newUrl, newType]) => {
  const query: Record<string, string> = { ...route.query } as Record<string, string>

  if (newUrl) { query.search = newUrl } else { delete query.search }
  if (newType && newType !== 'contains') { query.urlMatch = newType } else { delete query.urlMatch }
  delete query.method
  delete query.status

  const currentSearch = typeof route.query.search === 'string' ? route.query.search : ''
  const currentUrlMatch = typeof route.query.urlMatch === 'string' ? route.query.urlMatch : ''
  const desiredUrlMatch = (newType && newType !== 'contains') ? newType : ''
  if (
    currentSearch === (newUrl || '') &&
    currentUrlMatch === desiredUrlMatch &&
    !('method' in route.query)
  ) {
    return
  }

  router.replace({ query })
})

watch(
  () => [route.query.search, route.query.urlMatch],
  ([newSearch, newUrlMatch]) => {
    const search = typeof newSearch === 'string' ? newSearch : ''
    const match = parseUrlMatchType(newUrlMatch)
    if (urlValue.value !== search) urlValue.value = search
    if (urlMatchType.value !== match) urlMatchType.value = match
  }
)

onMounted(() => {
  // Fetch the full journal once via GET /__admin/requests. Any `?search=…`
  // (or other filter) seeded from the route is applied client-side by the
  // `requests` computed, so a deep-link lands on the filtered view without
  // a second request.
  void loadRequests()
})
</script>
