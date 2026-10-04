/**
 * Unit tests for the action's main functionality, src/main.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import * as core from '../__fixtures__/core.js'
import type { ReportFile } from '../src/discover.js'
import type { TestReport } from '../src/report.js'

const findReports = vi.fn<(workspace: string) => Promise<ReportFile[]>>()
const setStatuses =
  vi.fn<
    (token: string, reports: TestReport[], jobName: string) => Promise<void>
  >()
const writeSummary =
  vi.fn<(reports: TestReport[], retentionDays: number) => Promise<void>>()

// Mocks should be declared before the module being tested is imported.
vi.doMock('@actions/core', () => core)
vi.doMock('../src/discover.js', () => ({ findReports }))
vi.doMock('../src/status.js', () => ({ setStatuses }))
vi.doMock('../src/summary.js', () => ({ writeSummary }))

const { run } = await import('../src/main.js')
const { parseJUnit } = await import('../src/junit.js')

describe('main.ts', () => {
  let workspace: string

  const report = async (name: string, xml: string): Promise<ReportFile> => {
    const file = path.join(workspace, `${name}.junit.xml`)
    await writeFile(file, xml)
    return { file, path: `${name}.junit.xml`, name, parse: parseJUnit }
  }

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), 'main-'))
    process.env.GITHUB_WORKSPACE = workspace
    core.getInput.mockImplementation(
      (name) => ({ token: 'token', 'retention-days': '7' })[name] ?? ''
    )
  })

  afterEach(async () => {
    delete process.env.GITHUB_WORKSPACE
    await rm(workspace, { recursive: true, force: true })
  })

  it('Reports passing tests without failing', async () => {
    findReports.mockResolvedValue([
      await report(
        'unit',
        '<testsuite name="s"><testcase name="a"/></testsuite>'
      )
    ])

    await run()

    expect(findReports).toHaveBeenCalledWith(workspace)
    const reports = [
      {
        name: 'unit',
        path: 'unit.junit.xml',
        cases: [{ suite: 's', name: 'a', status: 'passed', durationMs: 0 }]
      }
    ]
    expect(writeSummary).toHaveBeenCalledWith(reports, 7)
    expect(core.getInput).toHaveBeenCalledWith('token', { required: true })
    expect(setStatuses).toHaveBeenCalledWith('token', reports, '')
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('Fails when any test failed', async () => {
    findReports.mockResolvedValue([
      await report(
        'a',
        '<testsuite><testcase name="a"><failure/></testcase></testsuite>'
      ),
      await report(
        'b',
        '<testsuite><testcase name="b"><failure/></testcase><testcase name="c"/></testsuite>'
      )
    ])

    await run()

    expect(setStatuses).toHaveBeenCalled()
    expect(core.setFailed).toHaveBeenCalledWith('2 tests failed')
  })

  it('Says one test failed', async () => {
    findReports.mockResolvedValue([
      await report(
        'a',
        '<testsuite><testcase name="a"><error/></testcase></testsuite>'
      )
    ])

    await run()

    expect(core.setFailed).toHaveBeenCalledWith('1 test failed')
  })

  it('Warns and passes when there are no reports', async () => {
    findReports.mockResolvedValue([])

    await run()

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('No test reports found')
    )
    expect(writeSummary).not.toHaveBeenCalled()
    expect(setStatuses).not.toHaveBeenCalled()
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('Reports a report that cannot be parsed as a failed test', async () => {
    findReports.mockResolvedValue([
      await report('bad', '<project/>'),
      await report('good', '<testsuite><testcase name="a"/></testsuite>')
    ])

    await run()

    expect(core.error).toHaveBeenCalledWith(
      'Could not parse bad.junit.xml: not a JUnit report: no <testsuite> element'
    )
    const reports = [
      {
        name: 'bad',
        path: 'bad.junit.xml',
        cases: [
          {
            suite: '',
            name: 'Could not parse report',
            status: 'failed',
            durationMs: 0,
            message: 'not a JUnit report: no <testsuite> element'
          }
        ],
        parseError: 'not a JUnit report: no <testsuite> element'
      },
      {
        name: 'good',
        path: 'good.junit.xml',
        cases: [{ suite: '', name: 'a', status: 'passed', durationMs: 0 }]
      }
    ]
    expect(writeSummary).toHaveBeenCalledWith(reports, 7)
    expect(setStatuses).toHaveBeenCalledWith('token', reports, '')
    expect(core.setFailed).toHaveBeenCalledWith('1 report could not be parsed')
  })

  it('Fails naming both failed tests and unparsable reports', async () => {
    findReports.mockResolvedValue([
      await report('a', '<project/>'),
      await report('b', '<project/>'),
      await report(
        'c',
        '<testsuite><testcase name="a"><failure/></testcase></testsuite>'
      )
    ])

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      '1 test failed and 2 reports could not be parsed'
    )
  })

  it.each([
    [
      'the matrix values',
      '',
      '{"os":"ubuntu-latest","node":24}',
      'ubuntu-latest, 24'
    ],
    ['nothing outside a matrix', '', 'null', ''],
    [
      'the name input over the matrix',
      'unit',
      '{"os":"ubuntu-latest"}',
      'unit'
    ],
    ['nothing for an unevaluated default', '', '${{ toJSON(matrix) }}', '']
  ])('Names the job after %s', async (_, name, matrix, expected) => {
    core.getInput.mockImplementation(
      (input) =>
        ({ token: 'token', 'retention-days': '7', name, matrix })[input] ?? ''
    )
    findReports.mockResolvedValue([
      await report('unit', '<testsuite><testcase name="a"/></testsuite>')
    ])

    await run()

    expect(setStatuses).toHaveBeenCalledWith(
      'token',
      expect.anything(),
      expected
    )
  })

  it.each(['0', '1.5', 'week', ''])(
    'Fails when retention-days is %p',
    async (days) => {
      core.getInput.mockImplementation((name) =>
        name === 'retention-days' ? days : 'token'
      )
      findReports.mockResolvedValue([
        await report('unit', '<testsuite><testcase name="a"/></testsuite>')
      ])

      await run()

      expect(core.setFailed).toHaveBeenCalledWith(
        `retention-days must be a whole number of days, at least 1, not '${days}'`
      )
      expect(writeSummary).not.toHaveBeenCalled()
    }
  )

  it('Searches the current directory outside of Actions', async () => {
    delete process.env.GITHUB_WORKSPACE
    findReports.mockResolvedValue([])

    await run()

    expect(findReports).toHaveBeenCalledWith(process.cwd())
  })
})
