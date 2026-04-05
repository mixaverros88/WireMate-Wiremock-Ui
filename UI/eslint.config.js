// ESLint flat config (ESLint 9+).
//
// Goals:
//   • Keep noise low — strict TS + the Vue defaults catch most real bugs.
//   • Defer to Prettier for formatting; we don't argue about commas.
//   • Allow `_`-prefixed unused vars so existing `catch (_e)` patterns
//     don't all need to be rewritten.
//
// To run:  npm run lint   /   npm run lint:fix

import vue from 'eslint-plugin-vue'
import vueTsConfig from '@vue/eslint-config-typescript'
import prettierConfig from '@vue/eslint-config-prettier'

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'playwright-report/**',
      'test-results/**',
      '*.min.js',
    ],
  },
  ...vue.configs['flat/recommended'],
  ...vueTsConfig(),
  prettierConfig,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'vue/multi-word-component-names': 'off',
    },
  },
]
