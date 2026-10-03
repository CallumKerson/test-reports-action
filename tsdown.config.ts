// See: https://tsdown.dev/options/config-file

import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: 'src/index.ts',
  // Keep dist/index.js, which action.yaml runs, rather than .mjs
  fixedExtension: false,
  // An action runs dist/index.js as is, with no install step, so every
  // dependency has to be bundled into it
  deps: { alwaysBundle: [/.*/] },
  sourcemap: true
})
