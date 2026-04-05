<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { BaseButton, BaseButtonEnum, BaseSpinner, BaseToast, BaseToastEnum, BaseToolbarButton, useTheme, useThemeClasses, useToast } from 'mgv-backoffice'
import {
  ArrowPathIcon,
  HeartIcon,
  ExclamationTriangleIcon,
} from '@heroicons/vue/24/outline'
import type { HealthResponse } from '../types/settings'
import {
  resetAll,
  shutdownServer,
  fetchHealth,
  fetchVersion,
} from '../services/settingsService'

const { isDark } = useTheme()
const t = useThemeClasses()
// Toast state delegated to the shared composable so the auto-hide timer
// is cleared on unmount — manual setTimeout would otherwise fire on a
// detached component if the user navigates away mid-toast.
const { showToast, toastMessage, toastType, showToastMessage } = useToast()

// ── State ───────────────────────────────────────────────────
const health = ref<HealthResponse | null>(null)
const version = ref('')
const loadingHealth = ref(true)

// Confirmations
const confirmReset = ref(false)
const confirmShutdown = ref(false)
const shutdownLoading = ref(false)

const sectionClasses = computed(() =>
  t.cardAlt
)

// ── Lifecycle ───────────────────────────────────────────────
onMounted(async () => {
  await refreshAll()
})

async function refreshAll() {
  await loadHealth()
}

// ── Methods ─────────────────────────────────────────────────
async function loadHealth() {
  loadingHealth.value = true
  try {
    const [h, v] = await Promise.all([fetchHealth(), fetchVersion()])
    health.value = h
    version.value = v.version
  } catch {
    showToastMessage('Failed to fetch server status', BaseToastEnum.ERROR)
  } finally {
    loadingHealth.value = false
  }
}

async function handleResetAll() {
  try {
    await resetAll()
    showToastMessage('Mappings and journal have been reset', BaseToastEnum.SUCCESS)
    confirmReset.value = false
    await loadHealth()
  } catch {
    showToastMessage('Failed to reset', BaseToastEnum.ERROR)
  }
}

async function handleShutdown() {
  shutdownLoading.value = true
  try {
    await shutdownServer()
    showToastMessage('Server shutdown initiated', BaseToastEnum.SUCCESS)
    confirmShutdown.value = false
  } catch {
    showToastMessage('Failed to shutdown server', BaseToastEnum.ERROR)
  } finally {
    shutdownLoading.value = false
  }
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

</script>

<template>
  <div>
    <div class="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-6">
      <!-- Toolbar -->
      <div class="flex items-center justify-end">
        <!-- Refresh — kept visually identical to NotificationsView's
             refresh button so the page-level affordance is consistent
             across views. -->
        <BaseToolbarButton
          label="Refresh"
          :disabled="loadingHealth"
          title="Refresh"
          @click="refreshAll"
        >
          <template #icon="{ iconClass }">
            <ArrowPathIcon :class="[iconClass, loadingHealth ? 'animate-spin text-emerald-500' : '']" />
          </template>
        </BaseToolbarButton>
      </div>

      <!-- ─── Server Health ───────────────────────────────── -->
      <div class="rounded-xl border p-5 transition-colors" :class="sectionClasses">
        <div class="flex items-center gap-2 mb-4">
          <HeartIcon class="w-4 h-4" :class="t.emeraldText" />
          <h2 class="text-sm font-semibold" :class="t.bodyText">Server Health</h2>
        </div>

        <!-- Description -->
        <p class="text-xs mb-4" :class="t.dimTextAlt">
          Monitors the WireMock server status, version, and uptime.
        </p>

        <div v-if="loadingHealth" class="flex justify-center py-6">
          <BaseSpinner size="lg" color="emerald" />
        </div>

        <div v-else-if="health" class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p class="text-xs uppercase tracking-wide mb-1" :class="t.dimText">Status</p>
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full" :class="health.status === 'healthy' ? 'bg-green-500' : 'bg-red-500'" />
              <span class="text-sm font-medium capitalize" :class="t.bodyText">{{ health.status }}</span>
            </div>
          </div>
          <div>
            <p class="text-xs uppercase tracking-wide mb-1" :class="t.dimText">Version</p>
            <p class="text-sm font-mono" :class="t.bodyText">{{ version || health.version }}</p>
          </div>
          <div>
            <p class="text-xs uppercase tracking-wide mb-1" :class="t.dimText">Uptime</p>
            <p class="text-sm" :class="t.bodyText">{{ formatUptime(health.uptimeInSeconds) }}</p>
          </div>
          <div>
            <p class="text-xs uppercase tracking-wide mb-1" :class="t.dimText">Last Checked</p>
            <p class="text-sm" :class="t.bodyText">{{ new Date(health.timestamp).toLocaleTimeString() }}</p>
          </div>
        </div>

        <div v-else class="text-center py-6">
          <p class="text-sm" :class="t.dimTextAlt">Unable to reach server</p>
        </div>
      </div>

      <div class="rounded-xl border-2 p-5 transition-colors"
        :class="isDark ? 'border-red-500/30 bg-red-500/5' : 'border-red-200 bg-red-50/50'">
        <div class="flex items-center gap-2 mb-4">
          <ExclamationTriangleIcon class="w-4 h-4 text-red-500" />
          <h2 class="text-sm font-semibold text-red-600">Danger Zone</h2>
        </div>
        <p class="text-xs mb-4 text-red-600">These are destructive operations.</p>
        <div class="space-y-4">
          <!--
            Two-line layout: top row carries the title + the action
            button(s); the description drops to its own row directly
            below. Keeps the action affordance flush with the heading
            while the longer explanatory copy gets its own line so it
            doesn't squeeze the button on narrow widths.
          -->
          <div>
            <div class="flex flex-wrap items-center gap-3">
              <p class="text-sm font-medium flex-1 min-w-0" :class="t.bodyText">Reset All</p>
              <div v-if="!confirmReset" class="shrink-0">
                <BaseButton description="Reset" :color="BaseButtonEnum.RED" @click="confirmReset = true" />
              </div>
              <div v-else class="flex flex-wrap items-center gap-2 shrink-0">
                <span class="text-xs text-red-500 font-medium">Are you sure?</span>
                <BaseButton description="Confirm" :color="BaseButtonEnum.RED" @click="handleResetAll" />
                <BaseButton description="Cancel" :color="BaseButtonEnum.WHITE" @click="confirmReset = false" />
              </div>
            </div>
            <p class="text-xs mt-1" :class="t.dimTextAlt">Reset all stub mappings to defaults and clear the request journal</p>
          </div>
          <div class="border-t" :class="isDark ? 'border-red-500/20' : 'border-red-200'" />
          <div>
            <div class="flex flex-wrap items-center gap-3">
              <p class="text-sm font-medium flex-1 min-w-0" :class="t.bodyText">Shutdown Server</p>
              <div v-if="!confirmShutdown" class="shrink-0">
                <BaseButton description="Shutdown" :color="BaseButtonEnum.RED" @click="confirmShutdown = true" />
              </div>
              <div v-else class="flex flex-wrap items-center gap-2 shrink-0">
                <span class="text-xs text-red-500 font-medium">This cannot be undone!</span>
                <BaseButton description="Yes, Shutdown" :color="BaseButtonEnum.RED" :is-loading="shutdownLoading" @click="handleShutdown" />
                <BaseButton description="Cancel" :color="BaseButtonEnum.WHITE" @click="confirmShutdown = false" />
              </div>
            </div>
            <p class="text-xs mt-1" :class="t.dimTextAlt">Gracefully terminate the WireMock server process</p>
          </div>
        </div>
      </div>

      <BaseToast v-if="showToast" :description="toastMessage" :mode="toastType" />
    </div>
  </div>
</template>
