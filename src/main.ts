import * as core from '@actions/core'
import { readFile } from 'node:fs/promises'
import { findReports, type ReportFile } from './discover.js'
import { countResults, type TestReport } from './report.js'
import { setStatuses } from './status.js'
import { writeSummary } from './summary.js'

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd()
    const files = await findReports(workspace)
    // Tests often don't run because an earlier step failed, and that step
    // already shows why
    if (files.length === 0) {
      core.warning(
        'No test reports found: looked for **/*.junit.xml and **/*.gotest.json'
      )
      return
    }

    const retentionDays = parseRetentionDays(core.getInput('retention-days'))
    const reports = await Promise.all(files.map(readReport))
    await writeSummary(reports, retentionDays)
    await setStatuses(core.getInput('token', { required: true }), reports)

    const failed = reports.reduce(
      (total, report) => total + countResults(report.cases).failed,
      0
    )
    if (failed > 0)
      core.setFailed(`${failed} ${failed === 1 ? 'test' : 'tests'} failed`)
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}

async function readReport(file: ReportFile): Promise<TestReport> {
  core.info(`Reading ${file.path}`)
  const content = await readFile(file.file, 'utf8')
  try {
    return { name: file.name, path: file.path, cases: file.parse(content) }
  } catch (error) {
    // One broken report shouldn't hide the results of all the others, so it
    // becomes a failed test of its own
    const message = (error as Error).message
    core.error(`Could not parse ${file.path}: ${message}`)
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
      ]
    }
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
