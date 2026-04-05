import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import { useTheme } from 'mgv-backoffice'

// Initialize the shared theme system with WireMate's localStorage key so
// existing user preferences (saved under `wiremate-theme` before the
// composable moved to mgv-backoffice) continue to be respected.
useTheme({ storageKey: 'wiremate-theme' })

const app = createApp(App)

app.use(router)
app.mount('#app')
