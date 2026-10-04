# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Development Commands

This project uses [mise](https://mise.jdx.dev/) for task running and tool
version management, and [aube](https://aube.sh) as the Node package manager.
Run `mise tasks` to see all available tasks.
Node modules are installed automatically before `mise run` when `package.json`
or `package-lock.json` change, through mise's experimental `npm` deps provider
running aube.
Add dependencies with `aube add`, not npm, so `package-lock.json` stays in
aube's layout.

- **Test**: `mise run test` - Runs the Vitest tests with coverage
- **Type check**: `mise run typecheck` - Runs `tsc --noEmit` over `src/`
- **Package**: `mise run package` - Bundles `src/` and every dependency into
  `dist/index.js` with [tsdown](https://tsdown.dev)
- **Fix**: `mise run fix-all` - Runs all formatters and auto-fixable linters
  via [hk](https://hk.jdx.dev/)
- **Check**: `mise run check-all` - Runs all linters without fixing
- **CI**: `mise run ci` - Runs `check-auto`, `typecheck` and `test`.
  `check-auto` checks all files on main or when a branch changes tooling
  config, otherwise only the files the branch changed.
  `check-auto` and `test` write JUnit reports to `reports/`, which the CI
  workflow then reports on with this action

Run `mise run fix-all` and `mise run test` before committing.
Linters are also wired to git hooks through `.config/hk.pkl`.

## Architecture Overview

This is a JavaScript GitHub Action, defined by `action.yaml`.
GitHub runs the committed `dist/index.js`, never `src/` directly.
On `main`, `dist/` is the latest release's build, not a build of `main`.

- `src/index.ts` - Entry point, which only calls `run()`
- `src/main.ts` - `run()`, which finds and parses the reports, writes the
  summary, sets commit statuses and fails if any test failed
- `src/discover.ts` - finds `**/*.junit.xml` and `**/*.gotest.json` in the
  workspace and names each report
- `src/junit.ts`, `src/gotest.ts` - parse each format into the `TestCase`
  model in `src/report.ts`
- `src/summary.ts`, `src/status.ts` - write the job summary and the
  `Tests / <name>` commit statuses
- `src/artifact.ts` - uploads the full summary as an artifact when it is over
  GitHub's 1 MiB limit, and the job summary is cut short
- `src/text.ts` - plurals and error messages, shared by the modules above
- `__tests__/` - Vitest tests, which mock `@actions/core`, `@actions/github` and
  `@actions/artifact` with the stubs in `__fixtures__/`
- `__fixtures__/junit/*.xml`, `__fixtures__/gotest/*.jsonl` - sample reports,
  named so the action doesn't find them when it runs on this repository

### Constraints that must not be broken

- **Never commit `dist/`.**
  The release workflow in `.github/workflows/main.yaml` rebuilds it on the
  release-please PR, so it ships together with the version bump and changelog.
  The `check-dist` workflow fails any other PR that changes `dist/`, and checks
  that the release PR's `dist/` matches `src/`.
- **`dist/` must be machine independent and readable.**
  tsdown writes each bundled module's path into `dist/index.js` and its
  sourcemap. `AUBE_NODE_LINKER=hoisted` in `.config/mise.toml` installs a flat
  npm-style `node_modules`, so those paths are the same locally and in CI.
  Do not minify to get around this: the action is public, and people audit
  `dist/index.js` before using it.
  The flat tree also lets code import packages it does not declare, so add
  every import to `package.json`. knip fails the check on any it finds.

## Configuration

Tool configuration lives in `.config/`, except for files their tools or editors
only look for at the root: `tsconfig.json`, `tsdown.config.ts`,
`.oxlintrc.json` and `.oxfmtrc.json`.
YAML files use the `.yaml` extension.

- Formatting is oxfmt, with no semicolons, single quotes and no trailing commas
- Linting is oxlint for TypeScript, with type-aware rules from tsgolint,
  rumdl for Markdown, ryl for YAML, tombi for TOML, and actionlint and zizmor
  for workflows
- knip finds unused files, exports and dependencies, and imports missing from
  `package.json`. Its config is `.config/knip.jsonc`

## Code Patterns

- Prefer direct functions; classes are for data, or where a function would be
  much more complicated
- Comments explain why a thing is the way it is, not what the line does
