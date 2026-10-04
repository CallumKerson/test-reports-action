import { jest } from '@jest/globals'

export const createCommitStatus =
  jest.fn<(params: object) => Promise<unknown>>()

export const getOctokit = jest.fn(() => ({
  rest: { repos: { createCommitStatus } }
}))

export const context = {
  payload: {} as {
    pull_request?: { head: { sha: string } }
    workflow_run?: { head_sha: string }
  },
  sha: 'merge-sha',
  repo: { owner: 'octo', repo: 'app' },
  serverUrl: 'https://github.com',
  runId: 42,
  job: 'test'
}
