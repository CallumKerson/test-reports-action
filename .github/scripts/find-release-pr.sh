#!/usr/bin/env bash
# Writes the branch of the open release PR to the step's `branch` output, or an
# empty string when there is none.
# Needs GH_TOKEN and GH_REPO.

set -euo pipefail

branch=$(gh pr list --state open --label 'autorelease: pending' \
	--json headRefName --jq '.[0].headRefName // empty')
echo "branch=$branch" >>"$GITHUB_OUTPUT"
