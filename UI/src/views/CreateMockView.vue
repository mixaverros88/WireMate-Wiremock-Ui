<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeftIcon } from '@heroicons/vue/24/outline'
import CreateMock from '../components/CreateMock.vue'
import { useTheme } from 'mgv-backoffice'

const route = useRoute()
const router = useRouter()
const { isDark } = useTheme()

// When this page is opened from inside a project (via the project detail
// "Create Mock" button) the project's id is passed as a query param so the
// form can pre-fill and hide the Project ID input. Falls back to an
// unbound form for the standalone "/mocks/create" route from the sidebar.
const projectId = computed<string | undefined>(() => {
  const raw = route.query.projectId
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  return undefined
})

function onMockCreated(_mockId: string) {
  // If the user came here from a specific project, send them back to
  // that project's detail page so they can see the new mock in context.
  // Otherwise fall back to the projects list (original behavior).
  if (projectId.value) {
    router.push({ name: 'project', params: { id: projectId.value } })
  } else {
    router.push({ name: 'projects' })
  }
}

// Goes back to the originating project (when launched from project detail)
// or to the projects list as a safe fallback. Same rule as after-create
// navigation so the user ends up wherever they came from.
function goBack() {
  if (projectId.value) {
    router.push({ name: 'project', params: { id: projectId.value } })
  } else {
    router.push({ name: 'projects' })
  }
}

// Button label depends on where "back" goes — helps the user know whether
// they're returning to a specific project or the projects list.
const backLabel = computed(() =>
  projectId.value ? 'Back to Project' : 'Back to Projects',
)
</script>

<template>
  <div class="px-4 sm:px-6 py-6 sm:py-8">
    <!-- Back button — mirrors the affordance on EditMockView so users
         always have an explicit way out of the form, not just the sidebar. -->
    <div class="max-w-7xl mx-auto">
      <button
        class="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
        :class="isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'"
        @click="goBack"
      >
        <ArrowLeftIcon class="w-4 h-4" />
        {{ backLabel }}
      </button>
    </div>
    <CreateMock :project-id="projectId" @created="onMockCreated" />
  </div>
</template>
