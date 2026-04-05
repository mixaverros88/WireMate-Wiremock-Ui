<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { BaseActionButton, BaseConfirmModal, BaseToast, BaseToastEnum, useTheme, useToast } from 'mgv-backoffice'
import {
  PencilSquareIcon,
  ClipboardDocumentListIcon,
  CubeIcon,
  ArrowPathIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline'
import type { MockResponse } from '../types/mock'
import { mockApi } from '../services/api'
import { deleteMock as deleteMockApi } from '../services/mockService'
import { checkStubExists } from '../services/stubService'
import { logsLinkRouteQuery } from '../utils/logsLink'

interface Props {
  mock: MockResponse
  currentProjectId: string
  // Hide the Edit button when already on the edit page so the slot
  // doesn't navigate to itself.
  showEdit?: boolean
}
const props = withDefaults(defineProps<Props>(), { showEdit: true })

const emit = defineEmits<{
  deleted: []
}>()

const router = useRouter()
const { isDark } = useTheme()
const { showToast, toastMessage, toastType, showToastMessage } = useToast()

type StubStatus = 'loading' | 'exists' | 'missing' | 'creating' | 'error'
const stubStatus = ref<StubStatus>('loading')

async function refreshStubStatus() {
  stubStatus.value = 'loading'
  try {
    const exists = await checkStubExists(props.mock.id)
    stubStatus.value = exists ? 'exists' : 'missing'
  } catch (_e) {
    stubStatus.value = 'error'
  }
}

onMounted(() => {
  refreshStubStatus()
})

function editMock() {
  router.push({ name: 'edit-mock', params: { id: props.currentProjectId, mockId: props.mock.id } })
}

function viewMockLogs() {
  // Carry the mock's url matcher type through as `urlMatch` so the Logs
  // page filters with the same matcher (see logsLinkRouteQuery).
  router.push({ name: 'logs', query: logsLinkRouteQuery(props.mock.request, props.mock.name) })
}

function viewMockStub() {
  router.push({ name: 'stub-detail', params: { id: props.mock.id } })
}

async function createStubForMock() {
  stubStatus.value = 'creating'
  try {
    await mockApi.republish(props.mock.id)
    stubStatus.value = 'exists'
    showToastMessage(`Stub created for '${props.mock.name}'`, BaseToastEnum.SUCCESS)
  } catch (e) {
    stubStatus.value = 'missing'
    showToastMessage(
      e instanceof Error ? `Failed to create stub: ${e.message}` : 'Failed to create stub',
      BaseToastEnum.ERROR,
    )
  }
}

const showDeleteModal = ref(false)
const isDeleting = ref(false)
function openDelete() { showDeleteModal.value = true }
async function confirmDelete() {
  if (isDeleting.value) return
  isDeleting.value = true
  try {
    await deleteMockApi(props.mock.id)
    showToastMessage('Mock deleted', BaseToastEnum.SUCCESS)
    emit('deleted')
  } catch (e) {
    showToastMessage(e instanceof Error ? e.message : 'Failed to delete mock', BaseToastEnum.ERROR)
  } finally {
    isDeleting.value = false
    showDeleteModal.value = false
  }
}
function cancelDelete() {
  if (isDeleting.value) return
  showDeleteModal.value = false
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between flex-wrap gap-2 rounded-xl border p-3"
      :class="isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200 shadow-sm'">
      <BaseActionButton
        v-if="showEdit"
        label="Edit"
        color="emerald"
        title="Edit this mock's request matcher and response definition"
        @click="editMock"
      >
        <template #icon="{ iconClass }">
          <PencilSquareIcon :class="iconClass" />
        </template>
      </BaseActionButton>
      <BaseActionButton
        label="Logs"
        color="sky"
        title="View request logs for this mock"
        @click="viewMockLogs"
      >
        <template #icon="{ iconClass }">
          <ClipboardDocumentListIcon :class="iconClass" />
        </template>
      </BaseActionButton>
      <BaseActionButton
        v-if="stubStatus === 'missing'"
        label="click to create"
        color="amberStrong"
        title="No matching stub on WireMock — click to create it from this mock"
        @click="createStubForMock"
      />
      <BaseActionButton
        v-else-if="stubStatus === 'creating'"
        label="Creating…"
        color="amberStrong"
        disabled
        title="Creating stub on WireMock…"
      >
        <template #icon="{ iconClass }">
          <ArrowPathIcon :class="iconClass" class="animate-spin text-emerald-500" />
        </template>
      </BaseActionButton>
      <BaseActionButton
        v-else
        label="Stub"
        color="indigo"
        title="Open the raw WireMock stub"
        @click="viewMockStub"
      >
        <template #icon="{ iconClass }">
          <CubeIcon :class="iconClass" />
        </template>
      </BaseActionButton>
      <BaseActionButton
        label="Delete"
        color="red"
        title="Permanently delete this mock and its WireMock stub"
        @click="openDelete"
      >
        <template #icon="{ iconClass }">
          <TrashIcon :class="iconClass" />
        </template>
      </BaseActionButton>
    </div>

    <BaseConfirmModal
      v-if="showDeleteModal"
      title="Delete Mock"
      :message="`Are you sure you want to delete mock '${mock.name}'? The mock will be removed from both the database and the WireMock service. This action cannot be undone.`"
      confirm-text="Yes, delete"
      cancel-text="Cancel"
      submitting-text="Deleting..."
      variant="danger"
      :submitting="isDeleting"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    />

    <BaseToast
      v-if="showToast"
      :mode="toastType"
      :description="toastMessage"
    />
  </div>
</template>
