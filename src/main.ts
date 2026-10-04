import { type ReportFile, findReports } from './discover.js'
import { type TestReport, countResults } from './report.js'
import { errorMessage, plural } from './text.js'
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

/*
 * A report that can't be parsed is a failed test in the summary and its
 * status, but it isn't a test that failed
 */
const failOnProblems = (reports: TestReport[]): void => {
  const unparsable = reports.filter((report) => report.parseError).length
  const failed = reports
    .filter((report) => !report.parseError)
    .reduce((total, report) => total + countResults(report.cases).failed, 0)
  const problems = [
    failed > 0 && `${plural(failed, 'test')} failed`,
    unparsable > 0 && `${plural(unparsable, 'report')} could not be parsed`
  ].filter(Boolean)
  if (problems.length > 0) {
    setFailed(problems.join(' and '))
  }
}

const readReport = async (file: ReportFile): Promise<TestReport> => {
  info(`Reading ${file.path}`)
  const content = await readFile(file.file, 'utf8')
  try {
    return { cases: file.parse(content), name: file.name, path: file.path }
  } catch (error) {
    /*
     * One broken report shouldn't hide the results of all the others, so it
     * becomes a failed test of its own
     */
    const message = errorMessage(error)
    logError(`Could not parse ${file.path}: ${message}`)
    return {
      cases: [
        {
          durationMs: 0,
          message,
          name: 'Could not parse report',
          status: 'failed',
          suite: ''
        }
      ],
      name: file.name,
      parseError: message,
      path: file.path
    }
  }
}

const matrixValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value
  }
  return JSON.stringify(value)
}

/*
 * Each job in a matrix finds reports with the same names, so without a name of
 * their own they would overwrite each other's statuses
 */
const jobName = (name: string, matrix: string): string => {
  if (name) {
    return name
  }
  try {
    const values: unknown = JSON.parse(matrix)
    if (typeof values !== 'object' || values === null) {
      return ''
    }
    return Object.values(values).map(matrixValue).join(', ')
  } catch {
    /*
     * Outside of Actions, such as with local-action, the default is left as
     * an unevaluated expression
     */
    return ''
  }
}

const parseRetentionDays = (input: string): number => {
  const days = Number(input)
  if (!Number.isInteger(days) || days < 1) {
    throw new Error(
      `retention-days must be a whole number of days, at least 1, not '${input}'`
    )
  }
  return days
}

const reportResults = async (): Promise<void> => {
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd()
  const files = await findReports(workspace)
  /*
   * Tests often don't run because an earlier step failed, and that step
   * already shows why
   */
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
export const run = async (): Promise<void> => {
  try {
    await reportResults()
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) {
      setFailed(error.message)
    }
  }
}
