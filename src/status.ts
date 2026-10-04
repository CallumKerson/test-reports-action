import * as core from '@actions/core'
import * as github from '@actions/github'
import { countResults, type TestReport } from './report.js'

/**
 * Sets a commit status for each report, linking back to this run.
 *
 * Statuses are named `Tests / <report>`, or `Tests (<jobName>) / <report>`
 * when the job has a name.
 */
export async function setStatuses(
  token: string,
  reports: TestReport[],
  jobName: string
): Promise<void> {
  const { context } = github
  const octokit = github.getOctokit(token)
  // On pull requests, context.sha is a merge commit that the PR never shows,
  // and on workflow_run it is the latest commit on the default branch
  const sha: string =
    context.payload.pull_request?.head.sha ??
    context.payload.workflow_run?.head_sha ??
    context.sha
  const prefix = jobName ? `Tests (${jobName})` : 'Tests'
  const targetUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`

  try {
    await Promise.all(
      reports.map(async (report) => {
        const counts = countResults(report.cases)
        return octokit.rest.repos.createCommitStatus({
          ...context.repo,
          sha,
          state: counts.failed > 0 ? 'failure' : 'success',
          context: `${prefix} / ${report.name}`,
          description: describe(counts),
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
      error.status === 403
    ) {
      core.warning(
        'Could not set commit statuses: the token needs the statuses: write permission'
      )
      return
    }
    throw error
  }
}

function describe(counts: ReturnType<typeof countResults>): string {
  const parts = (['passed', 'failed', 'skipped'] as const)
    .filter((status) => counts[status] > 0)
    .map((status) => `${counts[status]} ${status}`)
  return parts.length > 0 ? parts.join(', ') : 'No tests'
}
