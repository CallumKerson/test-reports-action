import { vi } from 'vitest'

const createCommitStatus = vi.fn<(params: object) => Promise<unknown>>(
  async () => ({})
)

const getOctokit = vi.fn<
  () => { rest: { repos: { createCommitStatus: typeof createCommitStatus } } }
>(() => ({
  rest: { repos: { createCommitStatus } }
}))

const context = {
  job: 'test',
  payload: {} as {
    pull_request?: { head: { sha: string } }
    workflow_run?: { head_sha: string }
  },
  repo: { owner: 'octo', repo: 'app' },
  runId: 42,
  serverUrl: 'https://github.com',
  sha: 'merge-sha'
}

export { context, createCommitStatus, getOctokit }
