// See: https://vitest.dev/config/

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // This config lives in .config/, so resolve paths from the repository root
    root: new URL('..', import.meta.url).pathname,
    clearMocks: true,
    coverage: {
      enabled: true,
      include: ['src/**'],
      // make-coverage-badge reads coverage/coverage-summary.json
      reporter: ['json-summary', 'text', 'lcov']
    },
    include: ['__tests__/**/*.test.ts'],
    // CI runs this action on the JUnit report, to test it on real output
    outputFile: { junit: 'reports/vitest.junit.xml' },
    reporters: ['verbose', 'junit']
  }
})
