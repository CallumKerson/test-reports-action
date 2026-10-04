import type {
  debug as coreDebug,
  error as coreError,
  info as coreInfo,
  getInput as coreGetInput,
  setOutput as coreSetOutput,
  setFailed as coreSetFailed,
  warning as coreWarning
} from '@actions/core'
import { vi } from 'vitest'

export const debug = vi.fn<typeof coreDebug>()
export const error = vi.fn<typeof coreError>()
export const info = vi.fn<typeof coreInfo>()
export const getInput = vi.fn<typeof coreGetInput>()
export const setOutput = vi.fn<typeof coreSetOutput>()
export const setFailed = vi.fn<typeof coreSetFailed>()
export const warning = vi.fn<typeof coreWarning>()

export const summary = {
  addRaw: vi.fn<(text: string, addEOL?: boolean) => typeof summary>(
    () => summary
  ),
  write: vi.fn<() => Promise<typeof summary>>(async () => summary)
}
