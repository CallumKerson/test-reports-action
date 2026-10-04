/**
 * Unit tests for the action's main functionality, src/main.ts
 */
import { jest } from '@jest/globals'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import * as core from '../__fixtures__/core.js'
import type { ReportFile } from '../src/discover.js'
import type { TestReport } from '../src/report.js'

const findReports = jest.fn<(workspace: string) => Promise<ReportFile[]>>()
const setStatuses =
  jest.fn<(token: string, reports: TestReport[]) => Promise<void>>()
const writeSummary =
  jest.fn<(reports: TestReport[], retentionDays: number) => Promise<void>>()

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('../src/discover.js', () => ({ findReports }))
jest.unstable_mockModule('../src/status.js', () => ({ setStatuses }))
jest.unstable_mockModule('../src/summary.js', () => ({ writeSummary }))

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
    expect(setStatuses).toHaveBeenCalledWith('token', reports)
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
        ]
      },
      {
        name: 'good',
        path: 'good.junit.xml',
        cases: [{ suite: '', name: 'a', status: 'passed', durationMs: 0 }]
      }
    ]
    expect(writeSummary).toHaveBeenCalledWith(reports, 7)
    expect(setStatuses).toHaveBeenCalledWith('token', reports)
    expect(core.setFailed).toHaveBeenCalledWith('1 test failed')
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
