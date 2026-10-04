/**
 * Unit tests for the action's main functionality, src/main.ts
 */
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { error, getInput, setFailed, warning } from '../__fixtures__/core.js'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import type { ReportFile } from '../src/discover.js'
import type { TestReport } from '../src/report.js'
import { parseJUnit } from '../src/junit.js'
import path from 'node:path'
import { run } from '../src/main.js'
import { tmpdir } from 'node:os'

const { findReports, setStatuses, writeSummary } = vi.hoisted(() => ({
  findReports: vi.fn<(workspace: string) => Promise<ReportFile[]>>(),
  setStatuses:
    vi.fn<
      (token: string, reports: TestReport[], jobName: string) => Promise<void>
    >(),
  writeSummary:
    vi.fn<(reports: TestReport[], retentionDays: number) => Promise<void>>()
}))

vi.mock(import('@actions/core'), async () => import('../__fixtures__/core.js'))
vi.mock(import('../src/discover.js'), () => ({ findReports }))
vi.mock(import('../src/status.js'), () => ({ setStatuses }))
vi.mock(import('../src/summary.js'), () => ({ writeSummary }))

vi.setConfig({ testTimeout: 5000 })

describe('main.ts', () => {
  // Each test gets a workspace of its own, and the action's inputs
  const setUp = async (
    inputs: Record<string, string> = {}
  ): Promise<string> => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'main-'))
    onTestFinished(async () => rm(workspace, { recursive: true, force: true }))
    vi.stubEnv('GITHUB_WORKSPACE', workspace)
    getInput.mockImplementation(
      (name) =>
        ({ token: 'token', 'retention-days': '7', ...inputs })[name] ?? ''
    )
    return workspace
  }

  const report = async (
    workspace: string,
    name: string,
    xml: string
  ): Promise<ReportFile> => {
    const file = path.join(workspace, `${name}.junit.xml`)
    await writeFile(file, xml)
    return { file, path: `${name}.junit.xml`, name, parse: parseJUnit }
  }

  it('reports passing tests without failing', async () => {
    expect.hasAssertions()

    const workspace = await setUp()
    findReports.mockResolvedValue([
      await report(
        workspace,
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
    expect(getInput).toHaveBeenCalledWith('token', { required: true })
    expect(setStatuses).toHaveBeenCalledWith('token', reports, '')
    expect(setFailed).not.toHaveBeenCalled()
  })

  it('fails when any test failed', async () => {
    expect.hasAssertions()

    const workspace = await setUp()
    findReports.mockResolvedValue([
      await report(
        workspace,
        'a',
        '<testsuite><testcase name="a"><failure/></testcase></testsuite>'
      ),
      await report(
        workspace,
        'b',
        '<testsuite><testcase name="b"><failure/></testcase><testcase name="c"/></testsuite>'
      )
    ])

    await run()

    expect(setStatuses).toHaveBeenCalledWith('token', expect.any(Array), '')
    expect(setFailed).toHaveBeenCalledWith('2 tests failed')
  })

  it('says one test failed', async () => {
    expect.hasAssertions()

    const workspace = await setUp()
    findReports.mockResolvedValue([
      await report(
        workspace,
        'a',
        '<testsuite><testcase name="a"><error/></testcase></testsuite>'
      )
    ])

    await run()

    expect(setFailed).toHaveBeenCalledWith('1 test failed')
  })

  it('warns and passes when there are no reports', async () => {
    expect.hasAssertions()

    findReports.mockResolvedValue([])

    await run()

    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('No test reports found')
    )
    expect(writeSummary).not.toHaveBeenCalled()
    expect(setStatuses).not.toHaveBeenCalled()
    expect(setFailed).not.toHaveBeenCalled()
  })

  it('reports a report that cannot be parsed as a failed test', async () => {
    expect.hasAssertions()

    const workspace = await setUp()
    findReports.mockResolvedValue([
      await report(workspace, 'bad', '<project/>'),
      await report(
        workspace,
        'good',
        '<testsuite><testcase name="a"/></testsuite>'
      )
    ])

    await run()

    expect(error).toHaveBeenCalledWith(
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
    expect(setFailed).toHaveBeenCalledWith('1 report could not be parsed')
  })

  it('fails naming both failed tests and unparsable reports', async () => {
    expect.hasAssertions()

    const workspace = await setUp()
    findReports.mockResolvedValue([
      await report(workspace, 'a', '<project/>'),
      await report(workspace, 'b', '<project/>'),
      await report(
        workspace,
        'c',
        '<testsuite><testcase name="a"><failure/></testcase></testsuite>'
      )
    ])

    await run()

    expect(setFailed).toHaveBeenCalledWith(
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
    // The default in action.yaml, as local-action leaves it unevaluated
    // oxlint-disable-next-line no-template-curly-in-string
    ['nothing for an unevaluated default', '', '${{ toJSON(matrix) }}', '']
  ])('names the job after %s', async (_title, name, matrix, expected) => {
    expect.hasAssertions()

    const workspace = await setUp({ name, matrix })
    findReports.mockResolvedValue([
      await report(
        workspace,
        'unit',
        '<testsuite><testcase name="a"/></testsuite>'
      )
    ])

    await run()

    expect(setStatuses).toHaveBeenCalledWith(
      'token',
      expect.anything(),
      expected
    )
  })

  it.each(['0', '1.5', 'week', ''])(
    'fails when retention-days is %p',
    async (days) => {
      expect.hasAssertions()

      const workspace = await setUp({ 'retention-days': days })
      findReports.mockResolvedValue([
        await report(
          workspace,
          'unit',
          '<testsuite><testcase name="a"/></testsuite>'
        )
      ])

      await run()

      expect(setFailed).toHaveBeenCalledWith(
        `retention-days must be a whole number of days, at least 1, not '${days}'`
      )
      expect(writeSummary).not.toHaveBeenCalled()
    }
  )

  it('searches the current directory outside of Actions', async () => {
    expect.hasAssertions()

    vi.stubEnv('GITHUB_WORKSPACE', undefined)
    findReports.mockResolvedValue([])

    await run()

    expect(findReports).toHaveBeenCalledWith(process.cwd())
  })
})
