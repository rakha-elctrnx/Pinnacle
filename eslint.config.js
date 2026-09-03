import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'backend/target']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['frontend/features/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'TemplateLiteral Literal[value=/\\b(bg-white|text-slate-\\d|border-slate-\\d|bg-slate-\\d|text-blue-\\d|bg-blue-\\d|border-blue-\\d|text-gray-\\d|bg-gray-\\d)\\b/]',
          message:
            'Use theme tokens (bg-bg-base, text-text-primary, etc.) instead of hardcoded light-mode colors',
        },
        {
          selector:
            'Literal[value=/\\b(bg-white|text-slate-\\d|border-slate-\\d|bg-slate-\\d|text-blue-\\d|bg-blue-\\d|border-blue-\\d|text-gray-\\d|bg-gray-\\d)\\b/]',
          message:
            'Use theme tokens (bg-bg-base, text-text-primary, etc.) instead of hardcoded light-mode colors',
        },
      ],
    },
  },
  {
    files: ['frontend/features/sql/components/query/SqlPreviewPanel.tsx'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
])
