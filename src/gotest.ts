import type { TestCase, TestStatus } from './report.js'

interface Event {
  Action?: string
  Package?: string
  Test?: string
  Output?: string
  Elapsed?: number
  ImportPath?: string
  FailedBuild?: string
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
  failedBuild?: string
  elapsed: number
  output: string[]
}

const results: Record<string, TestStatus> = {
  pass: 'passed',
  fail: 'failed',
  skip: 'skipped'
}

// go test prints these around each test's own output, and the status is
// already shown elsewhere
const noise = /^\s*(?:=== (?:RUN|PAUSE|CONT|NAME)|--- (?:PASS|FAIL|SKIP):)/

/**
 * Parses the output of `go test -json` into test cases.
 *
 * Only leaf tests are kept, so a table test counts once per subtest. A package
 * that fails without a failing test, such as from a build error, becomes one
 * failed case named after the package.
 */
export function parseGoTest(ndjson: string): TestCase[] {
  const tests = new Map<string, Test>()
  const packages = new Map<string, Package>()
  const builds = new Map<string, string[]>()
  const events = ndjson
    .split('\n')
    .map(parseEvent)
    .filter((event) => event !== undefined)

  for (const event of events) {
    if (event.ImportPath) {
      if (event.Action === 'build-output') {
        builds.set(event.ImportPath, [
          ...(builds.get(event.ImportPath) ?? []),
          event.Output ?? ''
        ])
      }
    } else if (event.Package && event.Test) {
      const id = key(event.Package, event.Test)
      const test = tests.get(id) ?? {
        pkg: event.Package,
        name: event.Test,
        elapsed: 0,
        output: []
      }
      tests.set(id, test)
      applyEvent(test, event)
    } else if (event.Package) {
      const pkg = packages.get(event.Package) ?? {
        failed: false,
        elapsed: 0,
        output: []
      }
      packages.set(event.Package, pkg)
      if (event.Action === 'output') {
        pkg.output.push(event.Output ?? '')
      }
      if (event.Action === 'fail') {
        pkg.failed = true
        pkg.failedBuild = event.FailedBuild
        pkg.elapsed = event.Elapsed ?? 0
      }
    }
  }

  if (events.length === 0 && ndjson.trim()) {
    throw new Error('not a go test -json report: no JSON events')
  }

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

// A package can fail without a failing test, such as from a build error
function packageFailures(
  packages: Map<string, Package>,
  builds: Map<string, string[]>,
  failedPackages: Set<string>
): TestCase[] {
  return [...packages]
    .filter(([name, pkg]) => pkg.failed && !failedPackages.has(name))
    .map(([name, pkg]) => {
      const output = pkg.failedBuild ? (builds.get(pkg.failedBuild) ?? []) : []
      return {
        suite: name,
        name,
        status: 'failed',
        durationMs: pkg.elapsed * 1000,
        message: clean([...output, ...pkg.output])
      }
    })
}

function parseEvent(line: string): Event | undefined {
  // Build errors go to stderr, which is sometimes redirected into the file
  if (!line.startsWith('{')) {
    return undefined
  }
  let fields: unknown
  try {
    fields = JSON.parse(line)
  } catch {
    return undefined
  }
  if (!isRecord(fields)) {
    return undefined
  }
  return {
    Action: text(fields.Action),
    Package: text(fields.Package),
    Test: text(fields.Test),
    Output: text(fields.Output),
    Elapsed: typeof fields.Elapsed === 'number' ? fields.Elapsed : undefined,
    ImportPath: text(fields.ImportPath),
    FailedBuild: text(fields.FailedBuild)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function applyEvent(test: Test, event: Event): void {
  if (event.Action === 'output') {
    test.output.push(event.Output ?? '')
  } else if (event.Action && event.Action in results) {
    test.status = results[event.Action]
    test.elapsed = event.Elapsed ?? 0
  }
}

// Collected in one pass, as comparing every test with every other is too slow
// for packages with tens of thousands of subtests
function findParents(all: Test[]): {
  parents: Set<string>
  failedParents: Set<string>
} {
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
  return { parents, failedParents }
}

// A parent test fails whenever a subtest does, so it is only worth reporting
// when it failed on its own account
function isReported(
  test: Test,
  parents: Set<string>,
  failedParents: Set<string>
): boolean {
  const name = key(test.pkg, test.name)
  if (!parents.has(name)) {
    return true
  }
  return status(test) === 'failed' && !failedParents.has(name)
}

function key(pkg: string, name: string): string {
  return `${pkg}\0${name}`
}

// A test with no result was cut off, by a panic or a timeout
function status(test: Test): TestStatus {
  return test.status ?? 'failed'
}

function toCase(test: Test): TestCase {
  const result: TestCase = {
    suite: test.pkg,
    name: test.name,
    status: status(test),
    durationMs: test.elapsed * 1000
  }
  if (result.status === 'failed') {
    const message = clean(test.output)
    if (message) {
      result.message = message
    }
  }
  return result
}

function clean(output: string[]): string {
  const lines = output
    .join('')
    .split('\n')
    .filter((line) => line.trim() && !noise.test(line))
  const indent = Math.min(
    ...lines.map((line) => line.length - line.trimStart().length)
  )
  return lines.map((line) => line.slice(indent).trimEnd()).join('\n')
}
