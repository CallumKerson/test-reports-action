import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { findReports } from '../src/discover.js'
import { parseGoTest } from '../src/gotest.js'
import { parseJUnit } from '../src/junit.js'

vi.mock(import('@actions/core'), async () => import('../__fixtures__/core.js'))

describe('discover.ts', () => {
  const workspaceWith = async (...names: string[]): Promise<string> => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'discover-'))
    onTestFinished(async () => rm(workspace, { recursive: true, force: true }))
    await Promise.all(
      names.map(async (name) => {
        const file = path.join(workspace, name)
        await mkdir(path.dirname(file), { recursive: true })
        await writeFile(file, '')
      })
    )
    return workspace
  }

  it('finds reports of each format and names them after the file', async () => {
    const workspace = await workspaceWith(
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

  it('adds the directory to names that clash', async () => {
    const workspace = await workspaceWith(
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

  it('uses the whole path for reports that only differ by format', async () => {
    const workspace = await workspaceWith(
      'ci/tests.junit.xml',
      'ci/tests.gotest.json'
    )

    const reports = await findReports(workspace)

    expect(reports.map(({ name }) => name)).toStrictEqual([
      'ci/tests.gotest.json',
      'ci/tests.junit.xml'
    ])
  })

  it('finds nothing in an empty workspace', async () => {
    const workspace = await workspaceWith()

    await expect(findReports(workspace)).resolves.toStrictEqual([])
  })
})
