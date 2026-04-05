<script setup lang="ts">
import { useRoute } from 'vue-router'
import { computed } from 'vue'
import { BaseAppLayout } from 'mgv-backoffice'
import AppSidebar from './components/AppSidebar.vue'

const route = useRoute()

// The /presentation route is full-bleed marketing — no sidebar / no
// inert-main behavior.
const showSidebar = computed(() => route.name !== 'presentation')
</script>

<template>
  <BaseAppLayout :show-sidebar="showSidebar">
    <template #sidebar>
      <AppSidebar />
    </template>
    <RouterView />
  </BaseAppLayout>
</template>
