import {
  type TestCounts,
  type TestReport,
  countResults,
  describeCounts
} from './report.js'
import { context, getOctokit } from '@actions/github'
import { warning } from '@actions/core'

const forbidden = 403

const statusPrefix = (jobName: string): string => {
  if (jobName) {
    return `Tests (${jobName})`
  }
  return 'Tests'
}

const state = (counts: TestCounts): 'failure' | 'success' => {
  if (counts.failed > 0) {
    return 'failure'
  }
  return 'success'
}

/**
 * Sets a commit status for each report, linking back to this run.
 *
 * Statuses are named `Tests / <report>`, or `Tests (<jobName>) / <report>`
 * when the job has a name.
 */
export const setStatuses = async (
  token: string,
  reports: TestReport[],
  jobName: string
): Promise<void> => {
  const octokit = getOctokit(token)
  // On pull requests, context.sha is a merge commit that the PR never shows,
  // and on workflow_run it is the latest commit on the default branch
  const sha: string =
    context.payload.pull_request?.head.sha ??
    context.payload.workflow_run?.head_sha ??
    context.sha
  const prefix = statusPrefix(jobName)
  const targetUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`

  try {
    await Promise.all(
      reports.map(async (report) => {
        const counts = countResults(report.cases)
        return octokit.rest.repos.createCommitStatus({
          ...context.repo,
          context: `${prefix} / ${report.name}`,
          description: describeCounts(counts),
          sha,
          state: state(counts),
          target_url: targetUrl
        })
      })
    )
  } catch (error) {
    // A token without statuses: write, such as on a pull request from a
    // fork, can't set any status, but the summary is still worth having
    if (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      error.status === forbidden
    ) {
      warning(
        'Could not set commit statuses: the token needs the statuses: write permission'
      )
      return
    }
    throw error
  }
}
