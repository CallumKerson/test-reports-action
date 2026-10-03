#!/usr/bin/env bash
# Commits dist/ to $BRANCH through the GitHub API rather than `git push`, so
# that with a GitHub App token the commit is signed by GitHub and verified.
# Needs GH_TOKEN, GITHUB_REPOSITORY and BRANCH, and the branch checked out.

set -euo pipefail

if [ -z "$(git status --porcelain dist/)" ]; then
	echo "dist/ is already up to date"
	exit 0
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# The bundle is too large to pass as a command line argument, so file contents
# are base64 encoded into files and read by jq from there
git ls-files --modified --others --exclude-standard dist/ | while read -r path; do
	base64 -w0 "$path" >"$work/contents"
	jq -n --arg path "$path" --rawfile contents "$work/contents" '{$path, $contents}'
done | jq -s . >"$work/additions.json"
git ls-files --deleted dist/ | jq -R '{path: .}' | jq -s . >"$work/deletions.json"

jq -n \
	--arg repo "$GITHUB_REPOSITORY" \
	--arg branch "$BRANCH" \
	--arg head "$(git rev-parse HEAD)" \
	--slurpfile additions "$work/additions.json" \
	--slurpfile deletions "$work/deletions.json" \
	'{
		query: "mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid url } } }",
		variables: {input: {
			branch: {repositoryNameWithOwner: $repo, branchName: $branch},
			expectedHeadOid: $head,
			message: {headline: "build: update dist for release"},
			fileChanges: {additions: $additions[0], deletions: $deletions[0]}
		}}
	}' >"$work/request.json"

gh api graphql --input "$work/request.json" --jq '.data.createCommitOnBranch.commit.url'
