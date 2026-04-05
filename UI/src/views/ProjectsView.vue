<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { BaseButton, BaseButtonEnum, BaseConfirmModal, BaseInput, BaseSpinner, BaseToast, BaseToastEnum, fmtCalendarDate, useTheme, useThemeClasses, useToast } from 'mgv-backoffice'
import { FolderIcon, EyeIcon, TrashIcon, MagnifyingGlassIcon, ExclamationTriangleIcon } from '@heroicons/vue/24/outline'
import type { Project } from '../types/project'
import { fetchProjects, deleteProject } from '../services/projectService'

const router = useRouter()
const { isDark } = useTheme()
const t = useThemeClasses()
const projects = ref<Project[]>([])
const loading = ref(true)
// Surfaces a visible error block (not just a toast) when the projects
// list can't load. Without this, a backend outage would leave the user
// on a perpetual spinner with a 3-second toast that disappears before
// they can read it.
const loadError = ref('')
const searchQuery = ref('')
// Toast state is delegated to the shared composable so the auto-hide
// timer is cleared on unmount — without this, navigating away mid-toast
// triggered a `setTimeout` callback on a detached component.
const { showToast, toastMessage, toastType, showToastMessage } = useToast()

const showDeleteModal = ref(false)
const projectToDelete = ref<Project | null>(null)
const isDeleting = ref(false)

const filteredProjects = computed(() => {
  if (!searchQuery.value.trim()) {
    return projects.value
  }
  const query = searchQuery.value.toLowerCase()
  return projects.value.filter(project =>
    project.name.toLowerCase().includes(query)
  )
})

onMounted(async () => {
  await loadProjects()
})

async function loadProjects() {
  loading.value = true
  loadError.value = ''
  try {
    projects.value = await fetchProjects()
  } catch (e) {
    // Keep the toast for short-lived feedback, but ALSO surface a
    // persistent error block — the toast vanishes after 3s, and the
    // user needs something they can read and a button to retry.
    const message = e instanceof Error ? e.message : 'Failed to load projects'
    loadError.value = message
    showToastMessage(message, BaseToastEnum.ERROR)
  } finally {
    loading.value = false
  }
}

function goToCreateProject() {
  router.push({ name: 'create-project' })
}

function viewProject(id: string) {
  router.push({ name: 'project', params: { id } })
}

function handleDelete(project: Project) {
  projectToDelete.value = project
  showDeleteModal.value = true
}

async function confirmDelete() {
  if (!projectToDelete.value || isDeleting.value) return
  isDeleting.value = true
  try {
    await deleteProject(projectToDelete.value.id)
    projects.value = projects.value.filter(p => p.id !== projectToDelete.value!.id)
    showToastMessage('Project deleted', BaseToastEnum.SUCCESS)
  } catch (_e) {
    showToastMessage('Failed to delete project', BaseToastEnum.ERROR)
  } finally {
    isDeleting.value = false
    showDeleteModal.value = false
    projectToDelete.value = null
  }
}

function cancelDelete() {
  if (isDeleting.value) return
  showDeleteModal.value = false
  projectToDelete.value = null
}

// "Mon D, YYYY" card label — lib formatter.
const formatDate = fmtCalendarDate
</script>

<template>
  <div>
    <div class="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <!-- Loading -->
      <div v-if="loading" class="flex justify-center py-20">
        <BaseSpinner size="lg" color="emerald" />
      </div>

      <!--
        Error state. Shown only when the initial fetch failed AND no
        projects are present (we don't want a stale list of projects to
        disappear underneath a transient retry error — the toast plus
        keeping the existing list is fine in that case).
      -->
      <div v-else-if="loadError && projects.length === 0" class="text-center py-20" role="alert">
        <ExclamationTriangleIcon class="w-16 h-16 mx-auto mb-4" :class="isDark ? 'text-red-500/70' : 'text-red-400'" />
        <h2 class="text-lg font-semibold mb-2" :class="t.bodyText">Couldn't load projects</h2>
        <p class="mb-6 max-w-md mx-auto" :class="t.dimTextAlt">{{ loadError }}</p>
        <BaseButton
          description="Retry"
          :color="BaseButtonEnum.GREEN"
          @click="loadProjects"
        />
      </div>

      <!-- Empty state -->
      <div v-else-if="projects.length === 0" class="text-center py-20">
        <FolderIcon class="w-16 h-16 mx-auto mb-4" :class="t.illustration" />
        <h2 class="text-lg font-semibold mb-2" :class="t.bodyText">No projects yet</h2>
        <p class="mb-6" :class="t.dimTextAlt">Create your first project to start building WireMock stubs.</p>
        <BaseButton
          description="Create Project"
          :color="BaseButtonEnum.GREEN"
          @click="goToCreateProject"
        />
      </div>

      <!-- Search bar and project grid -->
      <div v-else>
        <!-- Search bar — lib BaseInput with a leading magnifier, mirroring
             the StubsView search toolbar so the two lists share one skin. -->
        <div class="mb-6 relative">
          <MagnifyingGlassIcon class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none z-10"
            :class="isDark ? 'text-gray-500' : 'text-gray-400'" />
          <BaseInput
            v-model="searchQuery"
            type="text"
            placeholder="Search projects..."
            class="pl-9"
            aria-label="Search projects"
          />
        </div>

        <!-- Project list — 1 per row -->
        <div v-if="filteredProjects.length > 0" class="grid grid-cols-1 gap-5">
          <div
            v-for="project in filteredProjects"
            :key="project.id"
          class="rounded-xl border p-5 flex flex-col justify-between transition-all"
          :class="isDark
            ? 'bg-gray-900 border-gray-700 hover:bg-gray-800'
            : 'bg-white border-gray-200 shadow-sm hover:bg-gray-100'"
        >
          <!-- Top: icon + name -->
          <div>
            <div class="flex items-center gap-3 mb-1">
              <div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                :class="isDark ? 'bg-emerald-500/10' : 'bg-emerald-50'">
                <FolderIcon class="w-5 h-5" :class="t.emeraldText" />
              </div>
              <h3 class="font-semibold truncate" :class="t.primaryTextSoft">{{ project.name }}</h3>
            </div>
            <!--
              Use gray-500 in light mode (4.6:1 on white) instead of gray-400 (2.6:1)
              to meet WCAG AA for small text.
            -->
            <p class="text-xs mt-1" :class="isDark ? 'text-gray-500' : 'text-gray-500'">Created {{ formatDate(project.createdAt) }}</p>
          </div>

          <!-- Bottom: actions -->
          <div class="flex items-center gap-2 mt-4 pt-4 border-t"
            :class="t.divider">
            <!--
              Action buttons:
              * py-2.5 gets total height ~40px, closer to the 44px touch-target minimum
                (and much closer than the previous py-1.5 → 28px).
              * focus-visible rings give keyboard users a clear indicator per action
                (outline:none on focus was previously the only rule).
              * aria-label carries the project name so screen readers announce
                "View Tests123" / "Delete Tests123" instead of bare "View" / "Delete".
            -->
            <button
              type="button"
              :aria-label="`View ${project.name}`"
              @click="viewProject(project.id)"
              class="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-500"
              :class="isDark
                ? 'text-emerald-400 hover:bg-emerald-500/10 focus-visible:ring-offset-gray-900'
                : 'text-emerald-600 hover:bg-emerald-50 focus-visible:ring-offset-white'"
            >
              <EyeIcon class="w-4 h-4" />
              View
            </button>
            <button
              type="button"
              :aria-label="`Delete ${project.name}`"
              @click="handleDelete(project)"
              class="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-500"
              :class="isDark
                ? 'text-red-400 hover:bg-red-500/10 focus-visible:ring-offset-gray-900'
                : 'text-red-500 hover:bg-red-50 focus-visible:ring-offset-white'"
            >
              <TrashIcon class="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>
        </div>

        <!-- No search results state -->
        <div v-else class="text-center py-20">
          <FolderIcon class="w-16 h-16 mx-auto mb-4" :class="t.illustration" />
          <h2 class="text-lg font-semibold mb-2" :class="t.bodyText">No projects found</h2>
          <p :class="t.dimTextAlt">Try adjusting your search query.</p>
        </div>
      </div>
    </div>

    <!-- Delete confirmation modal -->
    <BaseConfirmModal
      v-if="showDeleteModal"
      title="Delete Project"
      :message="`Are you sure you want to delete project '${projectToDelete?.name}'? All mocks under this project will also be deleted, both from the database and the WireMock service. This action cannot be undone.`"
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
