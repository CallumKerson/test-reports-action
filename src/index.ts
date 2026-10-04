/**
 * The entrypoint for the action. This file simply imports and runs the action's
 * main logic.
 */
import { run } from './main.js'
import { setFailed } from '@actions/core'

/*
 * As run() reports its own errors, this only fails the step on anything it
 * lets through
 */
/* istanbul ignore next */
run().catch((error: unknown) => {
  setFailed(String(error))
})
