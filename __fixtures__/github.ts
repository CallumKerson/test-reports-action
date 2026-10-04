import { vi } from 'vitest'

export const createCommitStatus = vi.fn<(params: object) => Promise<unknown>>(
  async () => ({})
)

export const getOctokit = vi.fn<
  () => { rest: { repos: { createCommitStatus: typeof createCommitStatus } } }
>(() => ({
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
