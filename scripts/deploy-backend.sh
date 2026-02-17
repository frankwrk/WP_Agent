#!/usr/bin/env bash
set -euo pipefail

REMOTE="${1:-origin}"
SOURCE_REF="${2:-main}"
TARGET_BRANCH="${3:-deploy/backend}"
TARGET_REF="${TARGET_BRANCH}"

if [[ "${TARGET_REF}" != refs/* ]]; then
  TARGET_REF="refs/heads/${TARGET_REF}"
fi

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "Not inside a git repository." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is dirty. Commit/stash changes before deploy." >&2
  exit 1
fi

git fetch "$REMOTE" "$SOURCE_REF"

DEPLOY_SHA="$(git subtree split --prefix=apps/backend "$SOURCE_REF")"
echo "Deploying apps/backend subtree commit ${DEPLOY_SHA} to ${REMOTE}/${TARGET_REF}"

git push --force-with-lease "$REMOTE" "${DEPLOY_SHA}:${TARGET_REF}"

echo "Done. ${REMOTE}/${TARGET_REF} now points to ${DEPLOY_SHA}"
