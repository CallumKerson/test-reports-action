// See: https://vitest.dev/config/

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      include: ['src/**'],
      // make-coverage-badge reads coverage/coverage-summary.json
      reporter: ['json-summary', 'text', 'lcov']
    },
    include: ['__tests__/**/*.test.ts'],
    // Puts back each mock's own implementation after every test
    mockReset: true,
    // CI runs this action on the JUnit report, to test it on real output
    outputFile: { junit: 'reports/vitest.junit.xml' },
    reporters: ['verbose', 'junit'],
    // This config lives in .config/, so resolve paths from the repository root
    root: new URL('..', import.meta.url).pathname,
    // Puts back each stubbed environment variable after every test
    unstubEnvs: true
  }
})
