<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { BaseEntityPickerModal, type EntityPickerItem } from 'mgv-backoffice'
import { fetchProjects } from '../services/projectService'

// Thin wrapper around mgv-backoffice's BaseEntityPickerModal that
// preserves SelectProjectModal's existing API consumed by
// StubDetailView (props: title, message, confirmText, submittingText;
// events: confirm(projectId), cancel; exposed: submitting).

interface Props {
  title: string
  message?: string
  confirmText?: string
  submittingText?: string
}

withDefaults(defineProps<Props>(), {
  confirmText: 'Create',
  submittingText: 'Working...',
})

const emit = defineEmits<{
  confirm: [projectId: string]
  cancel: []
}>()

const submitting = ref(false)
const projects = ref<EntityPickerItem[]>([])

onMounted(async () => {
  try {
    const list = await fetchProjects()
    projects.value = list.map(p => ({ id: p.id, label: p.name }))
  } catch (_e) {
    projects.value = []
  }
})

defineExpose({ submitting })
</script>

<template>
  <BaseEntityPickerModal
    :title="title"
    :message="message"
    :items="projects"
    variant="emerald"
    search-placeholder="Search projects..."
    empty-message="No projects yet. Create one before adopting this stub."
    no-match-message="No projects match your search."
    :confirm-text="confirmText"
    :submitting-text="submittingText"
    :submitting="submitting"
    @confirm="(id: string) => emit('confirm', id)"
    @cancel="emit('cancel')"
  />
</template>
