import { type TestCase, type TestStatus, msPerSecond } from './report.js'

interface Event {
  Action: string | null
  Package: string | null
  Test: string | null
  Output: string | null
  Elapsed: number | null
  ImportPath: string | null
  FailedBuild: string | null
}

interface Test {
  pkg: string
  name: string
  status?: TestStatus
  elapsed: number
  output: string[]
}

interface Package {
  failed: boolean
  failedBuild: string | null
  elapsed: number
  output: string[]
}

interface Results {
  tests: Map<string, Test>
  packages: Map<string, Package>
  /** Build output, by the import path of what was built */
  builds: Map<string, string[]>
}

const statuses: Record<string, TestStatus> = {
  fail: 'failed',
  pass: 'passed',
  skip: 'skipped'
}

/*
 * The go test command prints these around each test's own output, and the
 * status is already shown elsewhere
 */
const noise = /^\s*(?:=== (?:RUN|PAUSE|CONT|NAME)|--- (?:PASS|FAIL|SKIP):)/

const getOrAdd = <Value>(
  map: Map<string, Value>,
  id: string,
  create: () => Value
): Value => {
  const value = map.get(id) ?? create()
  map.set(id, value)
  return value
}

const applyEvent = (test: Test, event: Event): void => {
  if (event.Action === 'output') {
    test.output.push(event.Output ?? '')
  } else if (event.Action && event.Action in statuses) {
    test.status = statuses[event.Action]
    test.elapsed = event.Elapsed ?? 0
  }
}

const applyPackageEvent = (pkg: Package, event: Event): void => {
  if (event.Action === 'output') {
    pkg.output.push(event.Output ?? '')
  } else if (event.Action === 'fail') {
    pkg.failed = true
    pkg.failedBuild = event.FailedBuild
    pkg.elapsed = event.Elapsed ?? 0
  }
}

const key = (pkg: string, name: string): string => `${pkg}\0${name}`

const record = ({ tests, packages, builds }: Results, event: Event): void => {
  const { ImportPath: importPath, Package: pkg, Test: name } = event
  if (importPath) {
    if (event.Action === 'build-output') {
      builds.set(importPath, [
        ...(builds.get(importPath) ?? []),
        event.Output ?? ''
      ])
    }
  } else if (pkg && name) {
    applyEvent(
      getOrAdd(tests, key(pkg, name), () => ({
        elapsed: 0,
        name,
        output: [],
        pkg
      })),
      event
    )
  } else if (pkg) {
    applyPackageEvent(
      getOrAdd(packages, pkg, () => ({
        elapsed: 0,
        failed: false,
        failedBuild: null,
        output: []
      })),
      event
    )
  }
}

const collect = (events: Event[]): Results => {
  const results: Results = {
    builds: new Map(),
    packages: new Map(),
    tests: new Map()
  }
  for (const event of events) {
    record(results, event)
  }
  return results
}

const clean = (output: string[]): string => {
  const lines = output
    .join('')
    .split('\n')
    .filter((line) => line.trim() && !noise.test(line))
  const indent = Math.min(
    ...lines.map((line) => line.length - line.trimStart().length)
  )
  return lines.map((line) => line.slice(indent).trimEnd()).join('\n')
}

const buildOutput = (
  builds: Map<string, string[]>,
  failedBuild: string | null
): string[] => {
  if (failedBuild) {
    return builds.get(failedBuild) ?? []
  }
  return []
}

// A package can fail without a failing test, such as from a build error
const packageFailures = (
  packages: Map<string, Package>,
  builds: Map<string, string[]>,
  failedPackages: Set<string>
): TestCase[] =>
  [...packages]
    .filter(([name, pkg]) => pkg.failed && !failedPackages.has(name))
    .map(([name, pkg]) => {
      const output = buildOutput(builds, pkg.failedBuild)
      return {
        durationMs: pkg.elapsed * msPerSecond,
        message: clean([...output, ...pkg.output]),
        name,
        status: 'failed',
        suite: name
      }
    })

const parseJson = (line: string): unknown => {
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const text = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return value
  }
  return null
}

const numeric = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return value
  }
  return null
}

const parseEvent = (line: string): Event | null => {
  // Build errors go to stderr, which is sometimes redirected into the file
  if (!line.startsWith('{')) {
    return null
  }
  const fields = parseJson(line)
  if (!isRecord(fields)) {
    return null
  }
  return {
    Action: text(fields.Action),
    Elapsed: numeric(fields.Elapsed),
    FailedBuild: text(fields.FailedBuild),
    ImportPath: text(fields.ImportPath),
    Output: text(fields.Output),
    Package: text(fields.Package),
    Test: text(fields.Test)
  }
}

// A test with no result was cut off, by a panic or a timeout
const status = (test: Test): TestStatus => test.status ?? 'failed'

/*
 * Collected in one pass, as comparing every test with every other is too slow
 * for packages with tens of thousands of subtests
 */
const findParents = (
  all: Test[]
): {
  parents: Set<string>
  failedParents: Set<string>
} => {
  const parents = new Set<string>()
  const failedParents = new Set<string>()
  for (const test of all) {
    const parts = test.name.split('/')
    for (let depth = 1; depth < parts.length; depth += 1) {
      const parent = key(test.pkg, parts.slice(0, depth).join('/'))
      parents.add(parent)
      if (status(test) === 'failed') {
        failedParents.add(parent)
      }
    }
  }
  return { failedParents, parents }
}

/*
 * A parent test fails whenever a subtest does, so it is only worth reporting
 * when it failed on its own account
 */
const isReported = (
  test: Test,
  parents: Set<string>,
  failedParents: Set<string>
): boolean => {
  const name = key(test.pkg, test.name)
  if (!parents.has(name)) {
    return true
  }
  return status(test) === 'failed' && !failedParents.has(name)
}

const toCase = (test: Test): TestCase => {
  const result: TestCase = {
    durationMs: test.elapsed * msPerSecond,
    name: test.name,
    status: status(test),
    suite: test.pkg
  }
  if (result.status === 'failed') {
    const message = clean(test.output)
    if (message) {
      result.message = message
    }
  }
  return result
}

/**
 * Parses the output of `go test -json` into test cases.
 *
 * Only leaf tests are kept, so a table test counts once per subtest. A package
 * that fails without a failing test, such as from a build error, becomes one
 * failed case named after the package.
 */
export const parseGoTest = (ndjson: string): TestCase[] => {
  const events = ndjson
    .split('\n')
    .map(parseEvent)
    .filter((event) => event !== null)
  if (events.length === 0 && ndjson.trim()) {
    throw new Error('not a go test -json report: no JSON events')
  }

  const { tests, packages, builds } = collect(events)
  const all = [...tests.values()]
  const { parents, failedParents } = findParents(all)
  const cases = all
    .filter((test) => isReported(test, parents, failedParents))
    .map(toCase)
  const failedPackages = new Set(
    cases
      .filter((testCase) => testCase.status === 'failed')
      .map((testCase) => testCase.suite)
  )

  return [...cases, ...packageFailures(packages, builds, failedPackages)]
}
