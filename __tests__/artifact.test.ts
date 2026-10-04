import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { uploadArtifact } from '../__fixtures__/artifact.js'
import { uploadFullSummary } from '../src/artifact.js'
import { warning } from '../__fixtures__/core.js'

vi.mock(
  import('@actions/artifact'),
  async () => import('../__fixtures__/artifact.js')
)
vi.mock(import('@actions/core'), async () => import('../__fixtures__/core.js'))
vi.mock(
  import('@actions/github'),
  async () => import('../__fixtures__/github.js')
)

vi.setConfig({ testTimeout: 5000 })

const conflict = new Error(
  'Failed to CreateArtifact: Received non-retryable error: Failed request: (409) Conflict: an artifact with this name already exists on the workflow run'
)

describe('artifact.ts', () => {
  // The summary is written to a directory in the runner's temp directory
  const runnerTemp = async (): Promise<void> => {
    const directory = await mkdtemp(path.join(tmpdir(), 'artifact-'))
    onTestFinished(async () => rm(directory, { force: true, recursive: true }))
    vi.stubEnv('RUNNER_TEMP', directory)
  }

  it('uploads the summary as an unzipped HTML page and links to it', async () => {
    expect.hasAssertions()

    await runnerTemp()
    uploadArtifact.mockImplementation(async (name, [file]) => {
      await expect(readFile(file, 'utf8')).resolves.toContain(
        '<title>Test results</title></head>\n<body>\n<h2>Results</h2>\n</body>'
      )
      return { id: 7 }
    })

    const url = await uploadFullSummary('<h2>Results</h2>', 3)

    expect(url).toBe('https://github.com/octo/app/actions/runs/42/artifacts/7')
    const [[name, [file], root, options]] = uploadArtifact.mock.calls
    expect(name).toBe('test-results-test.html')
    expect(path.basename(file)).toBe(name)
    expect(root).toBe(path.dirname(file))
    expect(options).toStrictEqual({ retentionDays: 3, skipArchive: true })
  })

  it('numbers the name when it is already taken', async () => {
    expect.hasAssertions()

    await runnerTemp()
    uploadArtifact
      .mockRejectedValueOnce(conflict)
      .mockRejectedValueOnce(conflict)
      .mockResolvedValue({ id: 9 })

    const url = await uploadFullSummary('<h2>Results</h2>', 7)

    expect(url).toBe('https://github.com/octo/app/actions/runs/42/artifacts/9')
    expect(uploadArtifact.mock.calls.map(([name]) => name)).toStrictEqual([
      'test-results-test.html',
      'test-results-test-2.html',
      'test-results-test-3.html'
    ])
  })

  it('warns when the upload fails', async () => {
    expect.hasAssertions()

    await runnerTemp()
    uploadArtifact.mockRejectedValue(new Error('Network down'))

    await expect(
      uploadFullSummary('<h2>Results</h2>', 7)
    ).resolves.toBeUndefined()
    expect(warning).toHaveBeenCalledWith(
      'Could not upload the full summary: Network down'
    )
  })

  it('warns when the upload throws something other than an Error', async () => {
    expect.hasAssertions()

    await runnerTemp()
    uploadArtifact.mockRejectedValue('Network down')

    await expect(
      uploadFullSummary('<h2>Results</h2>', 7)
    ).resolves.toBeUndefined()
    expect(warning).toHaveBeenCalledWith(
      'Could not upload the full summary: Network down'
    )
  })

  it('gives up when every name is taken', async () => {
    expect.hasAssertions()

    await runnerTemp()
    uploadArtifact.mockRejectedValue(conflict)

    await expect(
      uploadFullSummary('<h2>Results</h2>', 7)
    ).resolves.toBeUndefined()
    expect(uploadArtifact).toHaveBeenCalledTimes(50)
    expect(warning).toHaveBeenCalledWith(
      'Could not upload the full summary: test-results-test.html to test-results-test-50.html are all taken'
    )
  })
})
