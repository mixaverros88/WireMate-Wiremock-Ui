<script setup lang="ts">
import { ref } from 'vue'
import { BaseEntityPickerModal, type EntityPickerItem } from 'mgv-backoffice'
import { ArrowRightStartOnRectangleIcon } from '@heroicons/vue/24/outline'
import { useTheme } from 'mgv-backoffice'
import { fetchProjects } from '../services/projectService'

// Thin wrapper around mgv-backoffice's BaseEntityPickerModal that
// preserves the existing MoveModal API consumed by ProjectDetailView
// (props: title, message, currentProjectId; events: confirm(id),
// cancel; exposed: submitting).

interface Props {
  title: string
  message: string
  currentProjectId: string
}

defineProps<Props>()

const emit = defineEmits<{
  confirm: [targetProjectId: string]
  cancel: []
}>()

const { isDark } = useTheme()
const submitting = ref(false)

// Passed to BaseEntityPickerModal as `:loader` (not `:items`) so the
// modal shows its built-in loading spinner while this HTTP request is in
// flight, and surfaces a load error if it fails — instead of flashing an
// empty "no projects" list until the fetch resolves.
async function loadProjects(): Promise<EntityPickerItem[]> {
  const list = await fetchProjects()
  return list.map(p => ({ id: p.id, label: p.name }))
}

defineExpose({ submitting })
</script>

<template>
  <BaseEntityPickerModal
    :title="title"
    :message="message"
    :loader="loadProjects"
    :exclude-id="currentProjectId"
    variant="purple"
    search-placeholder="Search projects..."
    empty-message="No other projects available to move to."
    no-match-message="No projects match your search."
    confirm-text="Move"
    submitting-text="Moving..."
    :submitting="submitting"
    @confirm="(id: string) => emit('confirm', id)"
    @cancel="emit('cancel')"
  >
    <template #icon>
      <div
        class="flex-shrink-0 flex h-12 w-12 items-center justify-center rounded-full"
        :class="isDark ? 'bg-purple-900/30' : 'bg-purple-50'"
      >
        <ArrowRightStartOnRectangleIcon class="h-6 w-6 text-purple-600" aria-hidden="true" />
      </div>
    </template>
  </BaseEntityPickerModal>
</template>
