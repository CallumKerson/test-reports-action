import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as core from '../__fixtures__/core.js'
import * as github from '../__fixtures__/github.js'
import type { TestCase, TestReport } from '../src/report.js'

vi.doMock('@actions/core', () => core)
vi.doMock('@actions/github', () => github)

const { setStatuses } = await import('../src/status.js')

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

describe('status.ts', () => {
  beforeEach(() => {
    github.context.payload = {}
    github.createCommitStatus.mockResolvedValue({})
  })

  it('Sets a status for each report on the pushed commit', async () => {
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

    expect(github.getOctokit).toHaveBeenCalledWith('token')
    const common = {
      owner: 'octo',
      repo: 'app',
      sha: 'merge-sha',
      target_url: 'https://github.com/octo/app/actions/runs/42'
    }
    expect(github.createCommitStatus.mock.calls).toEqual([
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

  it('Sets statuses on the head of a pull request', async () => {
    github.context.payload = { pull_request: { head: { sha: 'head-sha' } } }

    await setStatuses('token', [report('unit', [])], '')

    expect(github.createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({ sha: 'head-sha' })
    )
  })

  it('Sets statuses on the commit that triggered a workflow_run', async () => {
    github.context.payload = { workflow_run: { head_sha: 'run-sha' } }

    await setStatuses('token', [report('unit', [])], '')

    expect(github.createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({ sha: 'run-sha' })
    )
  })

  it('Adds the job name to each status', async () => {
    await setStatuses('token', [report('unit', [])], 'ubuntu-latest, 24')

    expect(github.createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({ context: 'Tests (ubuntu-latest, 24) / unit' })
    )
  })

  it('Warns once and stops when the token cannot set statuses', async () => {
    github.createCommitStatus.mockRejectedValue(
      Object.assign(new Error('Resource not accessible by integration'), {
        status: 403
      })
    )

    await setStatuses('token', [report('a', []), report('b', [])], '')

    expect(github.createCommitStatus).toHaveBeenCalledTimes(1)
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('statuses: write')
    )
  })

  it('Throws other errors', async () => {
    github.createCommitStatus.mockRejectedValue(
      Object.assign(new Error('Server Error'), { status: 500 })
    )

    await expect(setStatuses('token', [report('a', [])], '')).rejects.toThrow(
      'Server Error'
    )
  })
})
