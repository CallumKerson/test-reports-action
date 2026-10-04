import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { warning } from '../__fixtures__/core.js'
import {
  context,
  createCommitStatus,
  getOctokit
} from '../__fixtures__/github.js'
import type { TestCase, TestReport } from '../src/report.js'
import { setStatuses } from '../src/status.js'

vi.mock(import('@actions/core'), async () => import('../__fixtures__/core.js'))
vi.mock(
  import('@actions/github'),
  async () => import('../__fixtures__/github.js')
)

vi.setConfig({ testTimeout: 5000 })

const testCase = (status: TestCase['status']): TestCase => ({
  suite: 's',
  name: 't',
  status,
  durationMs: 0
})

const report = (name: string, cases: TestCase[]): TestReport => ({
  name,
  path: `${name}.junit.xml`,
  cases
})

const triggeredBy = (payload: typeof context.payload): void => {
  context.payload = payload
  onTestFinished(() => {
    context.payload = {}
  })
}

describe('status.ts', () => {
  it('sets a status for each report on the pushed commit', async () => {
    expect.hasAssertions()

    await setStatuses(
      'token',
      [
        report('unit', [
          testCase('passed'),
          testCase('passed'),
          testCase('skipped')
        ]),
        report('go', [testCase('passed'), testCase('failed')]),
        report('empty', [])
      ],
      ''
    )

    expect(getOctokit).toHaveBeenCalledWith('token')
    const common = {
      owner: 'octo',
      repo: 'app',
      sha: 'merge-sha',
      target_url: 'https://github.com/octo/app/actions/runs/42'
    }
    expect(createCommitStatus.mock.calls).toStrictEqual([
      [
        {
          ...common,
          state: 'success',
          context: 'Tests / unit',
          description: '2 passed, 1 skipped'
        }
      ],
      [
        {
          ...common,
          state: 'failure',
          context: 'Tests / go',
          description: '1 passed, 1 failed'
        }
      ],
      [
        {
          ...common,
          state: 'success',
          context: 'Tests / empty',
          description: 'No tests'
        }
      ]
    ])
  })

  it('sets statuses on the head of a pull request', async () => {
    expect.hasAssertions()

    triggeredBy({ pull_request: { head: { sha: 'head-sha' } } })

    await setStatuses('token', [report('unit', [])], '')

    expect(createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({ sha: 'head-sha' })
    )
  })

  it('sets statuses on the commit that triggered a workflow_run', async () => {
    expect.hasAssertions()

    triggeredBy({ workflow_run: { head_sha: 'run-sha' } })

    await setStatuses('token', [report('unit', [])], '')

    expect(createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({ sha: 'run-sha' })
    )
  })

  it('adds the job name to each status', async () => {
    expect.hasAssertions()

    await setStatuses('token', [report('unit', [])], 'ubuntu-latest, 24')

    expect(createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({ context: 'Tests (ubuntu-latest, 24) / unit' })
    )
  })

  it('warns once when the token cannot set statuses', async () => {
    expect.hasAssertions()

    createCommitStatus.mockRejectedValue(
      Object.assign(new Error('Resource not accessible by integration'), {
        status: 403
      })
    )

    await setStatuses('token', [report('a', []), report('b', [])], '')

    expect(warning).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('statuses: write')
    )
  })

  it('throws other errors', async () => {
    expect.hasAssertions()

    createCommitStatus.mockRejectedValue(
      Object.assign(new Error('Server Error'), { status: 500 })
    )

    await expect(setStatuses('token', [report('a', [])], '')).rejects.toThrow(
      'Server Error'
    )
  })
})
