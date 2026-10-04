import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import * as artifact from '../__fixtures__/artifact.js'
import * as core from '../__fixtures__/core.js'
import * as github from '../__fixtures__/github.js'

vi.doMock(import('@actions/artifact'), () => artifact)
vi.doMock(import('@actions/core'), () => core)
vi.doMock(import('@actions/github'), () => github)

const { uploadFullSummary } = await import('../src/artifact.js')

const conflict = new Error(
  'Failed to CreateArtifact: Received non-retryable error: Failed request: (409) Conflict: an artifact with this name already exists on the workflow run'
)

describe('artifact.ts', () => {
  afterEach(async () => {
    await Promise.all(
      artifact.uploadArtifact.mock.calls.map(([, [file]]) =>
        rm(path.dirname(file), { recursive: true, force: true })
      )
    )
  })

  it('Uploads the summary as an unzipped HTML page and links to it', async () => {
    artifact.uploadArtifact.mockImplementation(async (name, [file]) => {
      await expect(readFile(file, 'utf8')).resolves.toContain(
        '<title>Test results</title></head>\n<body>\n<h2>Results</h2>\n</body>'
      )
      return { id: 7 }
    })

    const url = await uploadFullSummary('<h2>Results</h2>', 3)

    expect(url).toBe('https://github.com/octo/app/actions/runs/42/artifacts/7')
    const [[name, [file], root, options]] = artifact.uploadArtifact.mock.calls
    expect(name).toBe('test-results-test.html')
    expect(path.basename(file)).toBe(name)
    expect(root).toBe(path.dirname(file))
    expect(options).toStrictEqual({ retentionDays: 3, skipArchive: true })
  })

  it('Numbers the name when it is already taken', async () => {
    artifact.uploadArtifact
      .mockRejectedValueOnce(conflict)
      .mockRejectedValueOnce(conflict)
      .mockResolvedValue({ id: 9 })

    const url = await uploadFullSummary('<h2>Results</h2>', 7)

    expect(url).toBe('https://github.com/octo/app/actions/runs/42/artifacts/9')
    expect(
      artifact.uploadArtifact.mock.calls.map(([name]) => name)
    ).toStrictEqual([
      'test-results-test.html',
      'test-results-test-2.html',
      'test-results-test-3.html'
    ])
  })

  it('Warns when the upload fails', async () => {
    artifact.uploadArtifact.mockRejectedValue(new Error('Network down'))

    await expect(
      uploadFullSummary('<h2>Results</h2>', 7)
    ).resolves.toBeUndefined()
    expect(core.warning).toHaveBeenCalledWith(
      'Could not upload the full summary: Network down'
    )
  })

  it('Warns when the upload throws something other than an Error', async () => {
    artifact.uploadArtifact.mockRejectedValue('Network down')

    await expect(
      uploadFullSummary('<h2>Results</h2>', 7)
    ).resolves.toBeUndefined()
    expect(core.warning).toHaveBeenCalledWith(
      'Could not upload the full summary: Network down'
    )
  })

  it('Gives up when every name is taken', async () => {
    artifact.uploadArtifact.mockRejectedValue(conflict)

    await expect(
      uploadFullSummary('<h2>Results</h2>', 7)
    ).resolves.toBeUndefined()
    expect(artifact.uploadArtifact).toHaveBeenCalledTimes(50)
    expect(core.warning).toHaveBeenCalledWith(
      'Could not upload the full summary: test-results-test.html to test-results-test-50.html are all taken'
    )
  })
})
