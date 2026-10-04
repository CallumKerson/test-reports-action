import artifact from '@actions/artifact'
import * as core from '@actions/core'
import * as github from '@actions/github'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Matrix jobs share a job name, so each leg after the first takes the next
// free number
const maxAttempts = 50

/**
 * Uploads the full summary as a standalone HTML page.
 *
 * @returns A link to the artifact, or nothing if it could not be uploaded.
 */
export async function uploadFullSummary(
  html: string,
  retentionDays: number
): Promise<string | undefined> {
  const directory = await mkdtemp(
    path.join(process.env.RUNNER_TEMP || tmpdir(), 'test-reports-')
  )
  const base = `test-results-${github.context.job}`
  return upload(directory, base, page(html), retentionDays, 1)
}

// Each attempt depends on whether the name before it was taken, so they run
// one after another
async function upload(
  directory: string,
  base: string,
  content: string,
  retentionDays: number,
  attempt: number
): Promise<string | undefined> {
  if (attempt > maxAttempts) {
    core.warning(
      `Could not upload the full summary: ${base}.html to ${base}-${maxAttempts}.html are all taken`
    )
    return undefined
  }

  const { context } = github
  // Unzipped uploads are named after the file
  const file = path.join(
    directory,
    attempt === 1 ? `${base}.html` : `${base}-${attempt}.html`
  )
  await writeFile(file, content)
  try {
    const { id } = await artifact.uploadArtifact(
      path.basename(file),
      [file],
      directory,
      { retentionDays, skipArchive: true }
    )
    return `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}/artifacts/${id}`
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/\(409\)/.test(message)) {
      return upload(directory, base, content, retentionDays, attempt + 1)
    }
    core.warning(`Could not upload the full summary: ${message}`)
    return undefined
  }
}

function page(html: string): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Test results</title></head>
<body>
${html}
</body>
</html>
`
}
