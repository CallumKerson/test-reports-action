import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import * as core from '../__fixtures__/core.js'

vi.doMock(import('@actions/core'), () => core)

const { findReports } = await import('../src/discover.js')
const { parseGoTest } = await import('../src/gotest.js')
const { parseJUnit } = await import('../src/junit.js')

describe('discover.ts', () => {
  let workspace: string

  const files = async (...names: string[]): Promise<void> => {
    await Promise.all(
      names.map(async (name) => {
        const file = path.join(workspace, name)
        await mkdir(path.dirname(file), { recursive: true })
        await writeFile(file, '')
      })
    )
  }

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), 'discover-'))
  })

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true })
  })

  it('Finds reports of each format and names them after the file', async () => {
    await files(
      'unit.junit.xml',
      'go/results.gotest.json',
      'other.xml',
      'results.json',
      'node_modules/dep/dep.junit.xml',
      'web/node_modules/dep/dep.gotest.json'
    )

    const reports = await findReports(workspace)

    expect(reports).toStrictEqual([
      {
        file: path.join(workspace, 'go/results.gotest.json'),
        path: 'go/results.gotest.json',
        name: 'results',
        parse: parseGoTest
      },
      {
        file: path.join(workspace, 'unit.junit.xml'),
        path: 'unit.junit.xml',
        name: 'unit',
        parse: parseJUnit
      }
    ])
  })

  it('Adds the directory to names that clash', async () => {
    await files(
      'api/results.gotest.json',
      'worker/results.gotest.json',
      'results.junit.xml',
      'web/unit.junit.xml'
    )

    const reports = await findReports(workspace)

    expect(reports.map(({ name }) => name)).toStrictEqual([
      'api/results',
      'results',
      'unit',
      'worker/results'
    ])
  })

  it('Uses the whole path for reports that only differ by format', async () => {
    await files('ci/tests.junit.xml', 'ci/tests.gotest.json')

    const reports = await findReports(workspace)

    expect(reports.map(({ name }) => name)).toStrictEqual([
      'ci/tests.gotest.json',
      'ci/tests.junit.xml'
    ])
  })

  it('Finds nothing in an empty workspace', async () => {
    await expect(findReports(workspace)).resolves.toStrictEqual([])
  })
})
