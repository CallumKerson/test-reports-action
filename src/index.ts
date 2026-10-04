/**
 * The entrypoint for the action. This file simply imports and runs the action's
 * main logic.
 */
import * as core from '@actions/core'
import { run } from './main.js'

// run() reports its own errors, so this only fails the step on anything it
// lets through
/* istanbul ignore next */
run().catch((error: unknown) => {
  core.setFailed(String(error))
})
