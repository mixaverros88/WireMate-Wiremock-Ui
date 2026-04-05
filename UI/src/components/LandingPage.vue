<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ClipboardDocumentIcon, ClipboardDocumentCheckIcon } from '@heroicons/vue/24/outline'
import WireMateLogo from './WireMateLogo.vue'
import { WIREMOCK_ADMIN_URL } from '../config'

const router = useRouter()

const features = ref([
  {
    icon: '⚡',
    title: 'Visual Mock Builder',
    description: 'Create WireMock request/response mappings through an intuitive form. Methods, URLs, headers, JSON bodies, delays, and descriptions without hand-written JSON.'
  },
  {
    icon: '📂',
    title: 'Project Management',
    description: 'Organize mocks into projects with search and filtering. Quickly find what you need across all your projects and mocks.'
  },
  {
    icon: '🔍',
    title: 'WireMock Stubs Viewer',
    description: 'Browse all active stub mappings on your WireMock server. Filter by method, search by URL, and view response previews in real time.'
  },
  {
    icon: '📋',
    title: 'Logs',
    description: 'Inspect every request WireMock receives. Matched and unmatched. Filter by method, URL, or status with multiple search modes.'
  },
  {
    icon: '🎛️',
    title: 'Settings',
    description: 'Set global response delays, monitor server health, and perform admin operations from a single dashboard.'
  },
  {
    icon: '🛠️',
    title: 'Full CRUD Operations',
    description: 'Add, edit, and delete mocks or projects with ease. Keep your workspace clean and up to date.'
  },
  {
    icon: '📑',
    title: 'Clone Mocks',
    description: 'Duplicate any mock in one click. Save time by reusing existing configurations as a starting point.'
  },
  {
    icon: '🔀',
    title: 'Move Mocks Between Projects',
    description: 'Transfer mocks from one project to another. Reorganize your workspace as your needs evolve.'
  },
  {
    icon: '🔔',
    title: 'Sync Delta Notifications',
    description: 'A background task detects differences between the database and WireMock. View all deltas on the notifications page.'
  },
  {
    icon: '🚀',
    title: 'One-Click Publish',
    description: 'Push your stubs directly to any WireMock server. Go from draft to live mock in seconds with instant feedback.'
  },
  {
    icon: '🌓',
    title: 'Dark & Light Theme',
    description: 'Switch between dark and light modes with a single click. Every view adapts seamlessly to your preferred theme.'
  },
  {
    icon: '🗄️',
    title: 'Persistent Storage',
    description: 'All mappings are persisted to PostgreSQL. Never lose a stub. Search, edit, and restore at will.'
  },
  {
    icon: '🐳',
    title: 'Docker-Ready',
    description: 'Spin up the entire stack with Docker Compose. WireMock, PostgreSQL, and the UI. One command.'
  }
])

const curlCommand = `curl -X POST ${WIREMOCK_ADMIN_URL}/mappings \\
  -H "Content-Type: application/json" \\
  -d '{
    "request": {
      "method": "GET",
      "url": "/api/hello"
    },
    "response": {
      "status": 200,
      "jsonBody": { "message": "Hello from WireMock!" },
      "headers": {
        "Content-Type": "application/json"
      }
    }
  }'`

const copied = ref(false)

async function copyCommand() {
  try {
    await navigator.clipboard.writeText(curlCommand)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // fallback: silently ignore
  }
}

function goToApp() {
  router.push({ name: 'projects' })
}
</script>

<template>
  <div class="min-h-screen bg-[#0f1017] text-gray-400 overflow-x-hidden">

    <!-- ═══ Nav ═══ -->
    <nav class="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-[#0f1017]/80 border-b border-gray-800">
      <div class="max-w-[1100px] mx-auto flex items-center justify-between px-6 py-4">
        <div class="flex items-center gap-2.5">
          <WireMateLogo :size="36" />
          <span class="text-xl font-semibold text-gray-100 tracking-tight">WireMate</span>
        </div>
        <div class="flex items-center gap-7">
          <a href="#features" class="hidden md:inline text-sm text-gray-400 hover:text-gray-100 transition-colors">Features</a>
          <a href="#how-it-works" class="hidden md:inline text-sm text-gray-400 hover:text-gray-100 transition-colors">How it works</a>
          <button
            @click="goToApp"
            class="px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-500 transition-colors cursor-pointer"
          >
            Get Started
          </button>
        </div>
      </div>
    </nav>

    <!-- ═══ Hero ═══ -->
    <section class="relative max-w-[1100px] mx-auto pt-36 pb-20 px-6 grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
      <!-- glow -->
      <div class="absolute top-16 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[radial-gradient(ellipse,rgba(52,211,153,0.15)_0%,transparent_70%)] pointer-events-none"></div>

      <div class="relative z-10">
        <span class="inline-block px-3.5 py-1.5 rounded-full text-xs font-medium text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 mb-6">
          Open Source WireMock Management
        </span>
        <h1 class="text-5xl md:text-[52px] font-bold leading-[1.1] tracking-tight text-gray-100 mb-5">
          Mock APIs.<br />
          <span class="bg-gradient-to-r from-emerald-300 via-teal-400 to-teal-500 bg-clip-text text-transparent">Without the pain.</span>
        </h1>
        <p class="text-lg leading-relaxed max-w-[460px] mb-8">
          WireMate gives you a visual backoffice to create, manage, and publish
          WireMock stubs so your team can build and test faster.
        </p>
        <div class="flex gap-3.5 flex-wrap">
          <button
            @click="goToApp"
            class="inline-flex items-center px-7 py-3 rounded-xl text-base font-medium text-white bg-gradient-to-br from-emerald-700 to-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.3)] hover:shadow-[0_0_30px_rgba(52,211,153,0.5)] hover:-translate-y-0.5 transition-all cursor-pointer"
          >
            Get Started
          </button>
          <a
            href="#how-it-works"
            class="inline-flex items-center px-7 py-3 rounded-xl text-base font-medium text-gray-100 bg-[#22232e] border border-gray-700 hover:border-emerald-500 hover:bg-[#1a1b23] transition-all"
          >
            See How It Works
          </a>
        </div>
      </div>

      <!-- code window -->
      <div class="relative z-10">
        <div class="bg-[#1a1b23] border border-gray-700/60 rounded-xl overflow-hidden shadow-2xl">
          <div class="flex items-center justify-between px-4 pt-3.5">
            <div class="flex gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-red-500"></span>
              <span class="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
              <span class="w-2.5 h-2.5 rounded-full bg-green-500"></span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-[11px] font-mono text-gray-500">Test with cURL</span>
              <button
                @click="copyCommand"
                class="p-1 rounded transition-colors cursor-pointer"
                :class="copied ? 'text-emerald-400' : 'text-gray-500 hover:text-gray-300'"
                :title="copied ? 'Copied!' : 'Copy to clipboard'"
              >
                <ClipboardDocumentCheckIcon v-if="copied" class="w-4 h-4" />
                <ClipboardDocumentIcon v-else class="w-4 h-4" />
              </button>
            </div>
          </div>
          <pre class="px-4 pb-4 pt-3 overflow-x-auto"><code class="font-mono text-[13px] leading-relaxed text-gray-400">{{ curlCommand }}</code></pre>
        </div>
      </div>
    </section>

    <!-- ═══ Features ═══ -->
    <section id="features" class="max-w-[1100px] mx-auto py-20 px-6">
      <div class="text-center mb-14">
        <h2 class="text-4xl font-bold text-gray-100 tracking-tight mb-3">
          Everything you need to<br />
          <span class="bg-gradient-to-r from-emerald-300 via-teal-400 to-teal-500 bg-clip-text text-transparent">tame your mocks</span>
        </h2>
        <p class="text-[17px]">From stub creation to traffic debugging, WireMate handles the full mock lifecycle.</p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div
          v-for="feature in features"
          :key="feature.title"
          class="bg-[#1a1b23] border border-gray-700/60 rounded-2xl p-7 transition-all hover:border-emerald-700 hover:-translate-y-1"
        >
          <div class="flex items-center gap-3 mb-3">
            <span class="text-3xl">{{ feature.icon }}</span>
            <h3 class="text-[17px] font-semibold text-gray-100">{{ feature.title }}</h3>
          </div>
          <p class="text-sm leading-relaxed">{{ feature.description }}</p>
        </div>
      </div>
    </section>

    <!-- ═══ How it works ═══ -->
    <section id="how-it-works" class="max-w-[1100px] mx-auto py-20 px-6">
      <div class="text-center mb-14">
        <h2 class="text-4xl font-bold text-gray-100 tracking-tight mb-3">How it works</h2>
        <p class="text-[17px]">Four steps to mock nirvana.</p>
      </div>
      <div class="flex flex-col md:flex-row items-start gap-4 justify-center">
        <!-- Step 1 -->
        <div class="flex-1 max-w-[240px] text-center p-7">
          <div class="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-700 to-emerald-400 text-white text-lg font-bold mb-5">1</div>
          <h3 class="text-lg font-semibold text-gray-100 mb-2">Create a project</h3>
          <p class="text-sm leading-relaxed">Group your stubs by project. Stay organized from day one.</p>
        </div>
        <div class="text-emerald-400 text-2xl md:mt-10 self-center rotate-90 md:rotate-0">&rarr;</div>
        <!-- Step 2 -->
        <div class="flex-1 max-w-[240px] text-center p-7">
          <div class="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-700 to-emerald-400 text-white text-lg font-bold mb-5">2</div>
          <h3 class="text-lg font-semibold text-gray-100 mb-2">Build your stubs</h3>
          <p class="text-sm leading-relaxed">Use the ui to define requests, responses, delays, headers.</p>
        </div>
        <div class="text-emerald-400 text-2xl md:mt-10 self-center rotate-90 md:rotate-0">&rarr;</div>
        <!-- Step 3 -->
        <div class="flex-1 max-w-[240px] text-center p-7">
          <div class="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-700 to-emerald-400 text-white text-lg font-bold mb-5">3</div>
          <h3 class="text-lg font-semibold text-gray-100 mb-2 whitespace-nowrap">Publish to WireMock</h3>
          <p class="text-sm leading-relaxed">Publish your stubs to WireMock instantly. All stubs are persisted in the database.</p>
        </div>
        <div class="text-emerald-400 text-2xl md:mt-10 self-center rotate-90 md:rotate-0">&rarr;</div>
        <!-- Step 4 -->
        <div class="flex-1 max-w-[240px] text-center p-7">
          <div class="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-700 to-emerald-400 text-white text-lg font-bold mb-5">4</div>
          <h3 class="text-lg font-semibold text-gray-100 mb-2">Monitor & debug</h3>
          <p class="text-sm leading-relaxed">Search through WireMock logs to inspect incoming requests and debug your stubs.</p>
        </div>
      </div>
    </section>

    <!-- ═══ CTA ═══ -->
    <section class="relative text-center py-24 px-6">
      <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(52,211,153,0.1)_0%,transparent_60%)] pointer-events-none"></div>
      <div class="relative z-10">
        <h2 class="text-4xl font-bold text-gray-100 tracking-tight mb-2.5">Ready to simplify your mocks?</h2>
        <p class="text-[17px] mb-7">Get WireMate running locally in under a minute.</p>
        <div class="inline-block bg-[#1a1b23] border border-gray-700/60 rounded-lg px-6 py-3 mb-7">
          <code class="font-mono text-[15px] text-emerald-300">docker compose up -d</code>
        </div>
        <br />
        <button
          @click="goToApp"
          class="inline-flex items-center px-9 py-3.5 rounded-xl text-[17px] font-medium text-white bg-gradient-to-br from-emerald-700 to-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.3)] hover:shadow-[0_0_30px_rgba(52,211,153,0.5)] hover:-translate-y-0.5 transition-all cursor-pointer"
        >
          Open WireMate
        </button>
      </div>
    </section>

    <!-- ═══ Footer ═══ -->
    <footer class="border-t border-gray-800 py-8 px-6">
      <div class="max-w-[1100px] mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        <div class="flex items-center gap-2.5">
          <WireMateLogo :size="36" />
          <span class="text-xl font-semibold text-gray-100 tracking-tight">WireMate</span>
        </div>
        <p class="text-sm text-gray-500">Built for developers who'd rather ship than mock around.</p>
      </div>
    </footer>
  </div>
</template>
