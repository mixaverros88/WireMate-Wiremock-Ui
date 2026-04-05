import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// Vitest config — reuses the Vite config so Vue SFCs and Tailwind work
// the same way they do in dev. We run in jsdom because the composables
// and components under test touch `document` / `window`.

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      include: ['src/**/*.{test,spec}.ts'],
      coverage: {
        reporter: ['text', 'html'],
        include: ['src/**/*.{ts,vue}'],
        exclude: ['src/**/*.{test,spec}.ts', 'src/main.ts'],
      },
    },
  }),
)
