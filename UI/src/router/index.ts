import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/projects',
    },
    {
      path: '/presentation',
      name: 'presentation',
      component: () => import('../components/LandingPage.vue'),
    },
    {
      path: '/projects',
      name: 'projects',
      component: () => import('../views/ProjectsView.vue'),
    },
    {
      path: '/projects/:id',
      name: 'project',
      component: () => import('../views/ProjectDetailView.vue'),
    },
    {
      path: '/create-project',
      name: 'create-project',
      component: () => import('../views/CreateProjectView.vue'),
    },
    {
      path: '/mocks/create',
      name: 'create-mock',
      component: () => import('../views/CreateMockView.vue'),
    },
    {
      path: '/projects/:id/mocks/:mockId/edit',
      name: 'edit-mock',
      component: () => import('../views/EditMockView.vue'),
    },
    {
      // Shortcut: resolves a bare mockId to its owning project and forwards
      // to /projects/:id/mocks/:mockId/edit. Useful for links that only
      // carry the mockId (e.g. request-journal deep links, external tools).
      path: '/mock/:mockId',
      name: 'mock-redirect',
      component: () => import('../views/MockRedirectView.vue'),
    },
    {
      path: '/logs',
      name: 'logs',
      component: () => import('../views/RequestJournalView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../views/SettingsView.vue'),
    },
    {
      path: '/stubs',
      name: 'stubs',
      component: () => import('../views/StubsView.vue'),
    },
    {
      path: '/stubs/:id',
      name: 'stub-detail',
      component: () => import('../views/StubDetailView.vue'),
    },
    {
      path: '/notifications',
      name: 'notifications',
      component: () => import('../views/NotificationsView.vue'),
    },
    {
      path: '/near-misses',
      name: 'near-misses',
      component: () => import('../views/NearMissesView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('../views/NotFoundView.vue'),
    },
  ],
})

export default router
