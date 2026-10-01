import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vitest/config'

const FIGMA_UTILITIES = '@create-figma-plugin/utilities'

/**
 * Loads @create-figma-plugin/utilities without its `sourceMappingURL` comments. The published
 * package references TS sources it doesn't ship, which makes Vite print one warning per file once
 * the package is inlined — noise that buries real test output.
 * @returns Vite plugin.
 */
function stripFigmaUtilitiesSourcemaps(): Plugin {
  return {
    name: 'strip-figma-utilities-sourcemaps',
    enforce: 'pre',
    load(id) {
      if (!id.includes(`/node_modules/${FIGMA_UTILITIES}/`) || !id.endsWith('.js')) return null
      return readFileSync(id, 'utf-8').replace(/^\/\/# sourceMappingURL=.*$/gm, '')
    },
  }
}

// Level-1 (headless) test config: pure logic + code-thread handlers against a mock `figma` global.
// Build-time constants normally injected by scripts/build.js are pinned to "production, no network"
// values so the logger and analytics modules stay silent no-ops under test.
export default defineConfig({
  plugins: [stripFigmaUtilitiesSourcemaps()],
  define: {
    __DEV__: 'false',
    __LOG_SERVER__: '""',
    __POSTHOG_KEY__: '""',
    __POSTHOG_HOST__: '""',
    __VERSION__: '"test"',
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    unstubGlobals: true,
    server: {
      deps: {
        // The utilities module binds `figma.ui.onmessage` at import time and keeps a module-level
        // handler registry. Inlining it puts it under Vitest's module registry, so
        // vi.resetModules() re-evaluates it against each test's fresh mock `figma`.
        inline: [FIGMA_UTILITIES],
      },
    },
  },
})
