<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import {
  BellAlertIcon,
  ArrowPathIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline'
import { BaseConfirmModal, BaseToast, BaseToastEnum, BaseToolbarButton, Pagination, fmtDate, sanitizeHtml, useTheme, useThemeClasses, useToast } from 'mgv-backoffice'
import {
  fetchNotificationsPage,
  deleteNotification,
  deleteAllNotifications,
  DEFAULT_PAGE_SIZE,
} from '../services/notificationService'
import type { Notification } from '../types/notification'

const { isDark } = useTheme()
const t = useThemeClasses()
const { showToast, toastMessage, toastType, showToastMessage } = useToast()

const notifications = ref<Notification[]>([])
const loading = ref(true)
const error = ref('')

const limit = ref(DEFAULT_PAGE_SIZE)
const offset = ref(0)
const total = ref(0)

// Per-row + global delete state. Mirrors the request-journal page so the
// trash icons spin individually without freezing the rest of the list, and
// the Delete-All button gates a single in-flight wipe.
const deletingIds = ref<Set<number>>(new Set())
const isDeletingAll = ref(false)
const isDeletingSingle = ref(false)
const notificationToDelete = ref<Notification | null>(null)
const showDeleteAllModal = ref(false)

const totalPages = computed(() => (total.value === 0 ? 1 : Math.ceil(total.value / limit.value)))
const rangeStart = computed(() => (total.value === 0 ? 0 : offset.value + 1))
const rangeEnd = computed(() => Math.min(offset.value + notifications.value.length, total.value))

const deleteNotificationMessage = computed(() => {
  const n = notificationToDelete.value
  if (!n) return ''
  return `Notification #${n.id} will be permanently removed. This action cannot be undone.`
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    const page = await fetchNotificationsPage({ limit: limit.value, offset: offset.value })
    notifications.value = Array.isArray(page.items) ? page.items : []
    total.value = typeof page.total === 'number' ? page.total : notifications.value.length
    if (typeof page.limit === 'number' && page.limit > 0) {
      limit.value = page.limit
    }
    if (typeof page.offset === 'number' && page.offset >= 0) {
      offset.value = page.offset
    }
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to load notifications'
  } finally {
    loading.value = false
  }
}

// Bridge from mgv-backoffice's <Pagination> component (which emits a
// 1-based page index) to the offset-based loader used by the
// notifications service. Clamps to [1, totalPages] so a stale event
// from a re-render can't push the offset past the dataset.
function goToPage(page: number) {
  const target = Math.min(Math.max(1, Math.floor(page)), totalPages.value)
  const newOffset = (target - 1) * limit.value
  if (newOffset === offset.value) return
  offset.value = newOffset
  load()
}

function refresh() {
  offset.value = 0
  load()
}

// Per-row delete: open ConfirmModal first, only fire DELETE on @confirm so
// a misclick on the trash icon can't quietly lose a notification.
function openDeleteModal(notification: Notification) {
  if (notification.id == null) return
  notificationToDelete.value = notification
}

function closeDeleteModal() {
  if (isDeletingSingle.value) return
  notificationToDelete.value = null
}

async function confirmDelete() {
  const target = notificationToDelete.value
  if (!target || target.id == null) return
  deletingIds.value.add(target.id)
  deletingIds.value = new Set(deletingIds.value)
  isDeletingSingle.value = true
  try {
    await deleteNotification(target.id)
    notifications.value = notifications.value.filter((n) => n.id !== target.id)
    total.value = Math.max(0, total.value - 1)
    showToastMessage(`Notification #${target.id} deleted`, BaseToastEnum.SUCCESS)
    notificationToDelete.value = null
    // If we just emptied the current page but more remain behind, step back
    // so the user doesn't land on a phantom empty page.
    if (notifications.value.length === 0 && offset.value > 0) {
      offset.value = Math.max(0, offset.value - limit.value)
      await load()
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to delete notification'
    showToastMessage(message, BaseToastEnum.ERROR)
  } finally {
    deletingIds.value.delete(target.id)
    deletingIds.value = new Set(deletingIds.value)
    isDeletingSingle.value = false
  }
}

function openDeleteAllModal() {
  if (notifications.value.length === 0 && total.value === 0) return
  showDeleteAllModal.value = true
}

function closeDeleteAllModal() {
  if (isDeletingAll.value) return
  showDeleteAllModal.value = false
}

async function confirmDeleteAll() {
  isDeletingAll.value = true
  try {
    await deleteAllNotifications()
    notifications.value = []
    total.value = 0
    offset.value = 0
    showToastMessage('All notifications deleted', BaseToastEnum.SUCCESS)
    showDeleteAllModal.value = false
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to delete notifications'
    showToastMessage(message, BaseToastEnum.ERROR)
  } finally {
    isDeletingAll.value = false
  }
}

onMounted(load)

</script>

<template>
  <div class="max-w-4xl mx-auto px-4 sm:px-6 py-8">
    <!-- Header -->
    <div class="flex flex-wrap items-center justify-between gap-3 mb-8">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg flex items-center justify-center"
          :class="isDark ? 'bg-amber-500/10' : 'bg-amber-50'">
          <BellAlertIcon class="w-5 h-5" :class="t.amberText" />
        </div>
        <div>
          <h1 class="text-2xl font-bold" :class="t.primaryTextSoft">Notifications</h1>
          <p class="text-sm" :class="t.dimTextAlt">
            Sync deltas between database and WireMock
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <!-- Refresh is now a labelled button rather than a bare icon, matching
             the affordance of the new Delete All button next to it. -->
        <BaseToolbarButton
          label="Refresh"
          :disabled="loading"
          title="Refresh"
          @click="refresh"
        >
          <template #icon="{ iconClass }">
            <ArrowPathIcon :class="[iconClass, loading ? 'animate-spin text-emerald-500' : '']" />
          </template>
        </BaseToolbarButton>
        <!-- Delete-all wipes every notification via DELETE
             /backoffice/notifications. Disabled while there's nothing to
             delete or a delete is already in flight. -->
        <BaseToolbarButton
          variant="danger"
          label="Delete All"
          :disabled="isDeletingAll || (notifications.length === 0 && total === 0)"
          title="Delete all notifications"
          @click="openDeleteAllModal"
        >
          <template #icon="{ iconClass }">
            <TrashIcon :class="[iconClass, { 'animate-pulse': isDeletingAll }]" />
          </template>
        </BaseToolbarButton>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading && notifications.length === 0" class="text-center py-20">
      <ArrowPathIcon class="w-8 h-8 mx-auto mb-3 animate-spin text-emerald-500" />
      <p :class="t.dimTextAlt">Loading notifications...</p>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="text-center py-20">
      <p class="text-red-500 mb-4">{{ error }}</p>
      <button @click="load" type="button" class="text-sm font-medium text-emerald-500 hover:text-emerald-400 cursor-pointer">Try again</button>
    </div>

    <!-- Empty -->
    <div v-else-if="notifications.length === 0" class="text-center py-20">
      <BellAlertIcon class="w-16 h-16 mx-auto mb-4" :class="t.illustration" />
      <h2 class="text-lg font-semibold mb-2" :class="t.bodyText">No notifications</h2>
      <p :class="t.dimTextAlt">Everything is in sync between the database and WireMock.</p>
    </div>

    <!-- Notification list + pagination -->
    <template v-else>
      <div class="space-y-3">
        <div
          v-for="notification in notifications"
          :key="notification.id"
          class="rounded-xl border p-4 transition-colors"
          :class="isDark
            ? 'bg-gray-900 border-gray-700 hover:bg-gray-950'
            : 'bg-white border-gray-200 shadow-sm hover:bg-gray-100'"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-start gap-3 min-w-0">
              <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                :class="isDark ? 'bg-amber-500/10' : 'bg-amber-50'">
                <BellAlertIcon class="w-4 h-4" :class="t.amberText" />
              </div>
              <div class="min-w-0">
                <!--
                  notification.name may contain mixed HTML + text from the
                  backend. We pass it through `sanitizeHtml` (allow-list of
                  safe tags, strips every attribute except `a[href|title]`,
                  blocks javascript: hrefs, force rel=noopener target=_blank
                  on anchors) before v-html renders it. The sanitiser is
                  defence-in-depth on top of the trusted-source assumption;
                  if the backend later starts forwarding user content, we
                  already won't render scripts or onclick handlers.
                -->
                <div
                  v-html="sanitizeHtml(notification.name)"
                  class="notification-body text-sm font-medium break-words"
                  :class="t.primaryTextSoft"
                ></div>
                <p class="text-xs mt-1" :class="t.dimText">
                  Created: {{ fmtDate(notification.createdAt) }}
                </p>
              </div>
            </div>
            <div class="flex items-start gap-2 shrink-0">
              <span class="text-xs whitespace-nowrap mt-1.5" :class="isDark ? 'text-gray-600' : 'text-gray-400'">
                #{{ notification.id }}
              </span>
              <!-- Per-card delete. Opens the ConfirmModal rather than
                   firing DELETE directly, matching the destructive-action
                   pattern used elsewhere in the app. -->
              <button
                @click="openDeleteModal(notification)"
                type="button"
                :disabled="deletingIds.has(notification.id)"
                class="p-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                :class="isDark
                  ? 'text-gray-400 hover:text-red-400 hover:bg-red-500/10'
                  : 'text-gray-500 hover:text-red-600 hover:bg-red-50'"
                title="Delete notification"
              >
                <TrashIcon class="w-4 h-4" :class="{ 'animate-pulse': deletingIds.has(notification.id) }" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination controls — uses mgv-backoffice's <Pagination>
           component so the pager UI stays consistent across the app.
           Range hint is kept on the left; the component owns the
           First/Prev/Next/Last buttons. `goToPage` translates a 1-based
           page index from the component into the offset-based loader. -->
      <div class="flex items-center justify-between mt-6 pt-4 border-t"
        :class="isDark ? 'border-gray-800' : 'border-gray-200'">
        <p class="text-sm" :class="t.dimTextAlt">
          Showing <span class="font-medium" :class="t.bodyText">{{ rangeStart }}-{{ rangeEnd }}</span>
          of <span class="font-medium" :class="t.bodyText">{{ total }}</span>
        </p>
        <Pagination
          :total-items="total"
          :items-per-page="limit"
          @page-changed="goToPage"
        />
      </div>
    </template>

    <!-- Per-row delete confirmation. -->
    <BaseConfirmModal
      v-if="notificationToDelete"
      title="Delete this notification?"
      :message="deleteNotificationMessage"
      confirm-text="Yes, delete"
      cancel-text="Cancel"
      submitting-text="Deleting..."
      variant="danger"
      :submitting="isDeletingSingle"
      @confirm="confirmDelete"
      @cancel="closeDeleteModal"
    />

    <!-- Delete-all confirmation. -->
    <BaseConfirmModal
      v-if="showDeleteAllModal"
      :title="`Delete all ${total} notification${total === 1 ? '' : 's'}?`"
      message="This will permanently remove every notification. This action cannot be undone."
      confirm-text="Yes, delete all"
      cancel-text="Cancel"
      submitting-text="Deleting..."
      variant="danger"
      :submitting="isDeletingAll"
      @confirm="confirmDeleteAll"
      @cancel="closeDeleteAllModal"
    />

    <!-- Toast feedback for delete success / failure. -->
    <BaseToast
      v-if="showToast"
      :description="toastMessage"
      :mode="toastType"
    />
  </div>
</template>

<style scoped>
/*
 * Minimal defaults for rich HTML rendered via v-html inside a notification
 * card. Tailwind resets most tag styling globally, so we opt back in to
 * the common tags a notification body is likely to use.
 */
.notification-body :deep(p) {
  margin: 0 0 0.35rem;
}
.notification-body :deep(p:last-child) {
  margin-bottom: 0;
}
.notification-body :deep(a) {
  color: #059669;
  text-decoration: underline;
  word-break: break-all;
}
.notification-body :deep(a:hover) {
  color: #047857;
}
.notification-body :deep(strong),
.notification-body :deep(b) {
  font-weight: 600;
}
.notification-body :deep(em),
.notification-body :deep(i) {
  font-style: italic;
}
.notification-body :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.85em;
  padding: 0.05rem 0.3rem;
  border-radius: 0.25rem;
  background: rgba(107, 114, 128, 0.15);
}
.notification-body :deep(pre) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.85em;
  padding: 0.5rem 0.75rem;
  border-radius: 0.4rem;
  background: rgba(107, 114, 128, 0.15);
  overflow-x: auto;
  margin: 0.35rem 0;
}
.notification-body :deep(ul),
.notification-body :deep(ol) {
  margin: 0.25rem 0 0.25rem 1.25rem;
  padding: 0;
}
.notification-body :deep(ul) {
  list-style: disc;
}
.notification-body :deep(ol) {
  list-style: decimal;
}
.notification-body :deep(li) {
  margin: 0.1rem 0;
}
.notification-body :deep(br) {
  line-height: 1.5;
}
</style>
