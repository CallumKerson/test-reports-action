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

    const reports = await Promise.all(files.map(readReport))
    await writeSummary(reports)
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
    throw new Error(
      `Could not parse ${file.path}: ${(error as Error).message}`,
      { cause: error }
    )
  }
}
