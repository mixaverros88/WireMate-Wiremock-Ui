<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BaseButton, BaseButtonEnum, BaseSpinner, useTheme } from 'mgv-backoffice'
import { ArrowLeftIcon } from '@heroicons/vue/24/outline'
import type { MockResponse } from '../types/mock'
import { mockApi } from '../services/api'
import { ApiError } from '../services/errors'
import CreateMock from '../components/CreateMock.vue'
import MockActions from '../components/MockActions.vue'

const route = useRoute()
const router = useRouter()
const { isDark } = useTheme()

const mock = ref<MockResponse | null>(null)
const loading = ref(true)
const error = ref('')

const projectId = route.params.id as string
const mockId = route.params.mockId as string

onMounted(async () => {
  loading.value = true
  try {
    mock.value = await mockApi.fetchById(mockId)
  } catch (e) {
    // A 404 means the mock id isn't in the database (deleted, or a stale
    // link). Tell the user exactly that; any other failure is a generic
    // load error.
    error.value = e instanceof ApiError && e.status === 404
      ? 'This mock was not found in the database.'
      : 'Failed to load mock'
  } finally {
    loading.value = false
  }
})

function goBack() {
  router.push({ name: 'project', params: { id: projectId } })
}

function onMockUpdated(_mockId: string) {
  router.push({ name: 'project', params: { id: projectId } })
}

function onMockDeleted() {
  // Deleting the current mock leaves nothing to edit on this page; bounce
  // back to the project view so the user lands somewhere valid instead of
  // staring at a stale form.
  router.push({ name: 'project', params: { id: projectId } })
}
</script>

<template>
  <div>
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <!-- Back button -->
      <button
        class="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
        :class="isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'"
        @click="goBack"
      >
        <ArrowLeftIcon class="w-4 h-4" />
        Back to Project
      </button>

      <!-- Loading -->
      <div v-if="loading" class="flex justify-center py-20">
        <BaseSpinner size="lg" color="emerald" />
      </div>

      <!-- Error -->
      <div v-else-if="error" class="text-center py-20">
        <p class="text-red-500 mb-4">{{ error }}</p>
        <BaseButton
          description="Back to Project"
          :color="BaseButtonEnum.GREEN"
          @click="goBack"
        />
      </div>

      <!-- Edit mock form -->
      <div v-else-if="mock">
        <CreateMock :mock="mock" @updated="onMockUpdated">
          <template #sidebar-actions>
            <MockActions
              :mock="mock"
              :current-project-id="projectId"
              :show-edit="false"
              @deleted="onMockDeleted"
            />
          </template>
        </CreateMock>
      </div>
    </div>
  </div>
</template>
