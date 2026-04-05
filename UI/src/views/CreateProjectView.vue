<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { BaseButton, BaseButtonEnum, BaseToast, BaseToastEnum, useTheme, useThemeClasses, useToast } from 'mgv-backoffice'
import { createProject } from '../services/projectService'

const router = useRouter()
const { isDark } = useTheme()
const t = useThemeClasses()
const projectName = ref('')
const submitting = ref(false)
const touched = ref(false)
// Toast state delegated to the shared composable so the auto-hide
// timer is cleared on unmount — manual setTimeout would otherwise
// fire on a detached component if the user navigates away mid-toast.
const { showToast, toastMessage, toastType, showToastMessage } = useToast()

// Computed validation properties.
// Character-count and pattern restrictions were removed per product request —
// the backend is the source of truth for name constraints. We still require
// a non-empty trimmed name to avoid obvious user error.
const validationErrors = computed(() => {
  const errors: string[] = []
  const name = projectName.value.trim()

  if (!name) {
    errors.push('Project name is required')
  }

  return errors
})

const isValid = computed(() => validationErrors.value.length === 0 && projectName.value.trim().length > 0)

const showErrors = computed(() => touched.value && validationErrors.value.length > 0)

function handleInputBlur() {
  touched.value = true
}

async function handleSubmit() {
  touched.value = true

  if (!isValid.value) return

  const name = projectName.value.trim()
  submitting.value = true
  try {
    await createProject({ name })
    router.push({ name: 'projects' })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create project'
    showToastMessage(message, BaseToastEnum.ERROR)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div>
    <div class="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div class="rounded-lg border p-6 max-w-lg transition-colors"
        :class="isDark
          ? 'bg-gray-900 border-gray-700'
          : 'bg-white border-gray-200'">
        <form @submit.prevent="handleSubmit">
          <label for="project-name" class="block text-sm font-medium mb-2"
            :class="t.label">
            Project Name
          </label>
          <input
            id="project-name"
            v-model="projectName"
            type="text"
            placeholder="e.g. Payment Service Mocks"
            class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors"
            :class="[
              showErrors
                ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                : 'focus:ring-emerald-500 focus:border-emerald-500',
              isDark
                ? 'bg-gray-800 border-gray-600 text-gray-100 placeholder-gray-500'
                : 'bg-white border-gray-300 text-gray-800 placeholder-gray-500'
            ]"
            :disabled="submitting"
            @blur="handleInputBlur"
          />
          <!-- Validation Errors -->
          <div v-if="showErrors" class="mt-2 space-y-1">
            <p v-for="(error, index) in validationErrors" :key="index" class="text-sm text-red-500">
              {{ error }}
            </p>
          </div>
          <!--
            The submit button is only disabled while an in-flight request
            is pending. We intentionally do NOT disable it for invalid
            input — the underlying BaseButton has no dimmed/disabled
            style, so a "greyed out" button would look identical to a
            live one and the empty-submit click would silently do
            nothing. Leaving it clickable means handleSubmit runs,
            marks the form as touched, and the "Project name is
            required" error renders beneath the field.
          -->
          <div class="mt-6">
            <BaseButton
              :description="submitting ? 'Creating…' : 'Create Project'"
              :color="BaseButtonEnum.GREEN"
              :disabled="submitting"
              @click="handleSubmit"
            />
          </div>
        </form>
      </div>
    </div>

    <!-- Toast -->
    <BaseToast
      v-if="showToast"
      :description="toastMessage"
      :mode="toastType"
    />
  </div>
</template>
