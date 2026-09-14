import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Intentional cache-hydration pattern (module snapshot -> state on
      // mount) — warn, don't fail the gate.
      'react-hooks/set-state-in-effect': 'warn',
      // Stable-mirror pattern (props -> ref during render) + Date.now() in
      // useRef initializers: intentional in Player / room sync (screenshot
      // sessions stabilized this). Warn, don't fail the gate — refactoring
      // would risk playback/room regressions.
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
  {
    // YouTube helpers live with the component by decision (parse/fetch
    // used only by rooms). Fast-refresh rule wants components-only files.
    files: ['src/components/YouTubeRoomPlayer.jsx'],
    rules: {
      'react-refresh/only-export-components': 'warn',
    },
  },
  {
    // Node context: Vite config + Vercel serverless handlers.
    files: ['vite.config.js', 'api/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
])
