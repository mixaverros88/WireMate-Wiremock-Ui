<script setup lang="ts">
/**
 * Shortcut route: /mock/:mockId
 *
 * Users (or external tools / Slack links) may only know the mockId, not the
 * owning projectId. This view resolves the projectId by calling
 * GET /api/mocks/{mockId} — the endpoint returns the full MockResponse
 * which carries `projectId` — then router.replace()'s to the canonical
 * edit URL so the browser back button skips this hop.
 *
 * No UI beyond a loading / error state — it exists solely to redirect.
 */
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BaseButton, BaseButtonEnum, BaseSpinner, useTheme, useThemeClasses } from 'mgv-backoffice'
import { fetchMockById } from '../services/mockService'

const route = useRoute()
const router = useRouter()
const { isDark } = useTheme()

const t = useThemeClasses()
const error = ref('')
const mockId = String(route.params.mockId ?? '')

async function resolveAndRedirect() {
  if (!mockId) {
    error.value = 'Missing mockId in URL'
    return
  }

  try {
    const mock = await fetchMockById(mockId)
    if (!mock.projectId) {
      error.value = 'Server did not return a projectId for this mock'
      return
    }
    // Use the URL's mockId (the one we started with) rather than the
    // response's `mock.id`, so an edge-case where the backend omits `id`
    // still lands on the correct edit URL.
    router.replace({
      name: 'edit-mock',
      params: { id: mock.projectId, mockId },
    })
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to resolve mock'
  }
}

function goBackToProjects() {
  router.replace({ name: 'projects' })
}

onMounted(resolveAndRedirect)
</script>

<template>
  <div
    class="min-h-screen flex items-center justify-center px-4"
    :class="t.pageBg"
  >
    <div
      class="max-w-md w-full border rounded-xl p-8 text-center"
      :class="t.card"
    >
      <template v-if="!error">
        <div class="flex justify-center mb-4">
          <BaseSpinner size="lg" color="emerald" />
        </div>
        <h1 :class="t.primaryText" class="text-lg font-semibold">
          Opening mock…
        </h1>
        <p :class="t.mutedText" class="text-sm mt-2">
          Looking up project for mock
          <code class="font-mono">{{ mockId }}</code>
        </p>
      </template>
      <template v-else>
        <svg
          class="w-12 h-12 mx-auto mb-4 text-red-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <h1 :class="t.primaryText" class="text-lg font-semibold">
          Couldn't open mock
        </h1>
        <p class="text-sm text-red-500 mt-2 break-words">{{ error }}</p>
        <div class="flex justify-center gap-3 mt-5">
          <BaseButton
            description="Retry"
            :color="BaseButtonEnum.GREEN"
            @click="resolveAndRedirect"
          />
          <button
            type="button"
            @click="goBackToProjects"
            :class="isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-800'"
            class="text-sm font-medium cursor-pointer transition-colors"
          >
            Back to Projects
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
