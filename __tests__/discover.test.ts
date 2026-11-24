import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { findReports } from '../src/discover.js'
import { parseGoTest } from '../src/gotest.js'
import { parseJUnit } from '../src/junit.js'
import path from 'node:path'
import { tmpdir } from 'node:os'

vi.mock(import('@actions/core'), async () => import('../__fixtures__/core.js'))

vi.setConfig({ testTimeout: 5000 })

describe('discover.ts', () => {
  const workspaceWith = async (...names: string[]): Promise<string> => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'discover-'))
    onTestFinished(async () => rm(workspace, { force: true, recursive: true }))
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
    expect.hasAssertions()

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
        name: 'results',
        parse: parseGoTest,
        path: 'go/results.gotest.json'
      },
      {
        file: path.join(workspace, 'unit.junit.xml'),
        name: 'unit',
        parse: parseJUnit,
        path: 'unit.junit.xml'
      }
    ])
  })

  it('adds the directory to names that clash', async () => {
    expect.hasAssertions()

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
    expect.hasAssertions()

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

  it('finds reports named junit.xml and names them after their directory', async () => {
    expect.hasAssertions()

    const workspace = await workspaceWith(
      'junit.xml',
      'target/nextest/ci/junit.xml',
      'web/junit.xml',
      'node_modules/dep/junit.xml',
      'notjunit.xml'
    )

    const reports = await findReports(workspace)

    expect(reports).toStrictEqual([
      {
        file: path.join(workspace, 'junit.xml'),
        name: 'junit',
        parse: parseJUnit,
        path: 'junit.xml'
      },
      {
        file: path.join(workspace, 'target/nextest/ci/junit.xml'),
        name: 'ci',
        parse: parseJUnit,
        path: 'target/nextest/ci/junit.xml'
      },
      {
        file: path.join(workspace, 'web/junit.xml'),
        name: 'web',
        parse: parseJUnit,
        path: 'web/junit.xml'
      }
    ])
  })

  it('adds the directory to junit.xml names that clash', async () => {
    expect.hasAssertions()

    const workspace = await workspaceWith(
      'api/target/nextest/ci/junit.xml',
      'worker/target/nextest/ci/junit.xml',
      'ci.junit.xml',
      'unit/junit.xml',
      'web/unit.junit.xml'
    )

    const reports = await findReports(workspace)

    expect(reports.map(({ name }) => name)).toStrictEqual([
      'api/target/nextest/ci',
      'ci',
      'unit',
      'web/unit',
      'worker/target/nextest/ci'
    ])
  })

  it('uses the whole path for a junit.xml that clashes with a report beside it', async () => {
    expect.hasAssertions()

    const workspace = await workspaceWith(
      'ci/tests.junit.xml',
      'ci/tests/junit.xml'
    )

    const reports = await findReports(workspace)

    expect(reports.map(({ name }) => name)).toStrictEqual([
      'ci/tests.junit.xml',
      'ci/tests/junit.xml'
    ])
  })

  it('finds nothing in an empty workspace', async () => {
    expect.hasAssertions()

    const workspace = await workspaceWith()

    await expect(findReports(workspace)).resolves.toStrictEqual([])
  })
})
