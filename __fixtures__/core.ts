import type {
  debug as coreDebug,
  error as coreError,
  getInput as coreGetInput,
  info as coreInfo,
  setFailed as coreSetFailed,
  setOutput as coreSetOutput,
  warning as coreWarning
} from '@actions/core'
import { vi } from 'vitest'

const debug = vi.fn<typeof coreDebug>()
const error = vi.fn<typeof coreError>()
const info = vi.fn<typeof coreInfo>()
const getInput = vi.fn<typeof coreGetInput>()
const setOutput = vi.fn<typeof coreSetOutput>()
const setFailed = vi.fn<typeof coreSetFailed>()
const warning = vi.fn<typeof coreWarning>()

const summary = {
  addRaw: vi.fn<(text: string, addEOL?: boolean) => typeof summary>(
    () => summary
  ),
  write: vi.fn<() => Promise<typeof summary>>(async () => summary)
}

export { debug, error, getInput, info, setFailed, setOutput, summary, warning }
