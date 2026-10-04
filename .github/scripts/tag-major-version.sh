#!/usr/bin/env bash
# Moves the v$MAJOR tag to $SHA, as actions are used by major version, e.g.
# `@v1`, which release-please does not move.
# Needs MAJOR and SHA, and credentials that can push tags.

set -euo pipefail

git tag --force "v$MAJOR" "$SHA"
git push --force origin "v$MAJOR"
