import { type ReportFile, findReports } from './discover.js'
import { type TestReport, countResults } from './report.js'
import {
  getInput,
  info,
  error as logError,
  setFailed,
  warning
} from '@actions/core'
import { readFile } from 'node:fs/promises'
import { setStatuses } from './status.js'
import { writeSummary } from './summary.js'

// A report that can't be parsed is a failed test in the summary and its
// status, but it isn't a test that failed
function failOnProblems(reports: TestReport[]): void {
  const unparsable = reports.filter((report) => report.parseError).length
  const failed = reports
    .filter((report) => !report.parseError)
    .reduce((total, report) => total + countResults(report.cases).failed, 0)
  const problems = [
    failed > 0 && `${failed} ${failed === 1 ? 'test' : 'tests'} failed`,
    unparsable > 0 &&
      `${unparsable} ${unparsable === 1 ? 'report' : 'reports'} could not be parsed`
  ].filter(Boolean)
  if (problems.length > 0) {
    setFailed(problems.join(' and '))
  }
}

async function readReport(file: ReportFile): Promise<TestReport> {
  info(`Reading ${file.path}`)
  const content = await readFile(file.file, 'utf8')
  try {
    return { name: file.name, path: file.path, cases: file.parse(content) }
  } catch (error) {
    // One broken report shouldn't hide the results of all the others, so it
    // becomes a failed test of its own
    const message = error instanceof Error ? error.message : String(error)
    logError(`Could not parse ${file.path}: ${message}`)
    return {
      name: file.name,
      path: file.path,
      cases: [
        {
          suite: '',
          name: 'Could not parse report',
          status: 'failed',
          durationMs: 0,
          message
        }
      ],
      parseError: message
    }
  }
}

// Each job in a matrix finds reports with the same names, so without a name of
// their own they would overwrite each other's statuses
function jobName(name: string, matrix: string): string {
  if (name) {
    return name
  }
  try {
    const values: unknown = JSON.parse(matrix)
    if (typeof values !== 'object' || values === null) {
      return ''
    }
    return Object.values(values)
      .map((value) =>
        typeof value === 'string' ? value : JSON.stringify(value)
      )
      .join(', ')
  } catch {
    // Outside of Actions, such as with local-action, the default is left as
    // an unevaluated expression
    return ''
  }
}

function parseRetentionDays(input: string): number {
  const days = Number(input)
  if (!Number.isInteger(days) || days < 1) {
    throw new Error(
      `retention-days must be a whole number of days, at least 1, not '${input}'`
    )
  }
  return days
}

async function reportResults(): Promise<void> {
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd()
  const files = await findReports(workspace)
  // Tests often don't run because an earlier step failed, and that step
  // already shows why
  if (files.length === 0) {
    warning(
      'No test reports found: looked for **/*.junit.xml and **/*.gotest.json'
    )
    return
  }

  const retentionDays = parseRetentionDays(getInput('retention-days'))
  const reports = await Promise.all(files.map(readReport))
  await writeSummary(reports, retentionDays)
  await setStatuses(
    getInput('token', { required: true }),
    reports,
    jobName(getInput('name'), getInput('matrix'))
  )
  failOnProblems(reports)
}

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    await reportResults()
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) {
      setFailed(error.message)
    }
  }
}
