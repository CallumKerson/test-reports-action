import { mkdtemp, writeFile } from 'node:fs/promises'
import artifact from '@actions/artifact'
import { context } from '@actions/github'
import { errorMessage } from './text.js'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { warning } from '@actions/core'

// Matrix jobs share a job name, so each leg after the first takes the next
// free number
const maxAttempts = 50

interface Upload {
  directory: string
  base: string
  content: string
  retentionDays: number
}

// Unzipped uploads are named after the file
const fileName = (base: string, attempt: number): string => {
  if (attempt === 1) {
    return `${base}.html`
  }
  return `${base}-${attempt}.html`
}

const uploadAttempt = async (
  { directory, base, content, retentionDays }: Upload,
  attempt: number
): Promise<string> => {
  const file = path.join(directory, fileName(base, attempt))
  await writeFile(file, content)
  const { id } = await artifact.uploadArtifact(
    path.basename(file),
    [file],
    directory,
    { retentionDays, skipArchive: true }
  )
  return `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}/artifacts/${id}`
}

// Each attempt depends on whether the name before it was taken, so they run
// one after another
const upload = async (
  options: Upload,
  attempt: number
): Promise<string | undefined> => {
  if (attempt > maxAttempts) {
    warning(
      `Could not upload the full summary: ${options.base}.html to ${options.base}-${maxAttempts}.html are all taken`
    )
    return undefined
  }

  try {
    return await uploadAttempt(options, attempt)
  } catch (error) {
    const message = errorMessage(error)
    if (/\(409\)/.test(message)) {
      return upload(options, attempt + 1)
    }
    warning(`Could not upload the full summary: ${message}`)
    return undefined
  }
}

const page = (html: string): string =>
  `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Test results</title></head>
<body>
${html}
</body>
</html>
`

/**
 * Uploads the full summary as a standalone HTML page.
 *
 * @returns A link to the artifact, or nothing if it could not be uploaded.
 */
export const uploadFullSummary = async (
  html: string,
  retentionDays: number
): Promise<string | undefined> => {
  const directory = await mkdtemp(
    path.join(process.env.RUNNER_TEMP || tmpdir(), 'test-reports-')
  )
  const base = `test-results-${context.job}`
  return upload({ base, content: page(html), directory, retentionDays }, 1)
}
