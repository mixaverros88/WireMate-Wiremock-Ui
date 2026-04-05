<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  FolderIcon,
  BookOpenIcon,
  CogIcon,
  PlusIcon,
  ServerStackIcon,
  ExclamationCircleIcon,
  BellIcon,
} from '@heroicons/vue/24/outline'
import {
  BaseNotificationPanel,
  BaseSidebar,
  BaseStatusPill,
  fmtDate,
  useNotifications,
  usePolling,
  useTheme,
  type NavSection,
  type NotificationItem,
} from 'mgv-backoffice'
import WireMateLogo from './WireMateLogo.vue'
import { fetchHealth } from '../services/settingsService'
import { fetchNotificationsPage } from '../services/notificationService'

// Thin wrapper around mgv-backoffice's BaseSidebar that pins in the
// WireMate-specific pieces: nav sections, the WireMock health indicator,
// the build-time app version, the GitHub link in the footer, and the
// notification bell fed from the backend's backoffice notifications.

const { isDark } = useTheme()
const router = useRouter()

// Injected by Vite `define` at build time (see vite.config.ts).
const appVersion = __APP_VERSION__

const navSections: NavSection[] = [
  {
    title: 'Main',
    items: [
      { name: 'projects', label: 'Projects', icon: FolderIcon },
      { name: 'create-project', label: 'New Project', icon: PlusIcon },
    ],
  },
  {
    title: 'WireMock',
    items: [
      { name: 'logs', label: 'Logs', icon: BookOpenIcon },
      { name: 'stubs', label: 'WireMock Stubs', icon: ServerStackIcon },
      { name: 'near-misses', label: 'Near Misses', icon: ExclamationCircleIcon },
      { name: 'notifications', label: 'Notifications', icon: BellIcon },
      { name: 'settings', label: 'Settings', icon: CogIcon },
    ],
  },
]

// Notification bell — the shared useNotifications() store drives both the
// sidebar badge and the BaseNotificationPanel drawer. The backend has no
// per-notification read flag, so "unread" is derived client-side: anything
// created after the locally persisted last-seen instant counts as new.
const NOTIFICATIONS_LAST_SEEN_KEY = 'wiremate-notifications-last-seen'
const NOTIFICATIONS_BADGE_LIMIT = 20

const {
  setNotifications,
  markAllRead,
  open: notificationsOpen,
  closePanel: closeNotificationsPanel,
} = useNotifications()

// Notification names arrive as (sanitised-on-render) HTML snippets; the
// drawer renders plain text, so reduce them via an inert DOM parse.
// DOMParser never executes scripts or loads resources, and only the
// textContent is kept.
function notificationTitle(nameHtml: string): string {
  const doc = new DOMParser().parseFromString(nameHtml, 'text/html')
  return doc.body.textContent?.replace(/\s+/g, ' ').trim() || 'Notification'
}

async function loadNotifications() {
  try {
    const page = await fetchNotificationsPage({ limit: NOTIFICATIONS_BADGE_LIMIT })
    const lastSeen = Number(localStorage.getItem(NOTIFICATIONS_LAST_SEEN_KEY) ?? 0)
    setNotifications(
      page.items.map(
        (n): NotificationItem => ({
          id: n.id,
          title: notificationTitle(n.name),
          time: fmtDate(n.createdAt),
          read: new Date(n.createdAt).getTime() <= lastSeen,
          type: 'info',
        }),
      ),
    )
  } catch {
    // Badge is best-effort; the Notifications page surfaces fetch errors.
  }
}

// Closing the drawer counts as "seen": clear the badge and persist the
// cut-off so a reload doesn't resurrect already-viewed entries as unread.
watch(notificationsOpen, (isOpen) => {
  if (!isOpen) {
    localStorage.setItem(NOTIFICATIONS_LAST_SEEN_KEY, String(Date.now()))
    markAllRead()
  }
})

function onNotificationSelect() {
  closeNotificationsPanel()
  void router.push({ name: 'notifications' })
}

// WireMock admin-port health check
const healthStatus = ref<'healthy' | 'unhealthy' | 'unknown'>('unknown')

async function checkHealth() {
  try {
    const result = await fetchHealth()
    healthStatus.value = result.status === 'healthy' ? 'healthy' : 'unhealthy'
  } catch {
    healthStatus.value = 'unhealthy'
  }
}

// 30s admin-port ping is fine when the tab is visible, but a hidden tab
// has no reason to keep waking up WireMock's Jetty admin pool —
// usePolling pauses while hidden and refreshes + resumes on return.
// The notification badge doesn't warrant a timer: refresh-only mode
// (intervalMs: null) reloads it on mount and each return-to-visible.
usePolling(checkHealth, 30000)
usePolling(loadNotifications, null)
</script>

<template>
  <BaseSidebar
    :sections="navSections"
    home-route-name="projects"
    app-name="WireMate UI"
    :version="appVersion"
    show-notifications
  >
    <template #logo="{ size }">
      <WireMateLogo :size="size" />
    </template>

    <template #status>
      <!-- WireMock admin-port health indicator -->
      <BaseStatusPill
        :status="healthStatus === 'healthy' ? 'ok' : healthStatus === 'unhealthy' ? 'error' : 'unknown'"
        :label="`WireMock ${healthStatus === 'healthy' ? 'Connected' : healthStatus === 'unhealthy' ? 'Disconnected' : 'Checking...'}`"
      />
    </template>

    <template #footer>
      <!--
        Footer: version + GitHub link. Replaces BaseSidebar's default
        "appName vVersion" line so the GitHub icon can sit alongside.
      -->
      <div class="flex items-center justify-center gap-2 text-xs" :class="isDark ? 'text-gray-500' : 'text-gray-500'">
        <span>WireMate UI v{{ appVersion }}</span>
        <a
          href="https://github.com/mixaverros88/WireMate"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View WireMate source on GitHub (opens in a new tab)"
          class="transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          :class="isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" role="img" aria-hidden="true">
            <title>GitHub</title>
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
          </svg>
        </a>
      </div>
    </template>
  </BaseSidebar>

  <!--
    Notification drawer — teleported to <body> by the library. Shares the
    useNotifications() store with the sidebar bell, so the badge, the
    open/close toggle and this panel stay in sync. Selecting an entry
    jumps to the full Notifications page.
  -->
  <BaseNotificationPanel
    title="Notifications"
    empty-text="No sync notifications yet."
    @select="onNotificationSelect"
  />
</template>
