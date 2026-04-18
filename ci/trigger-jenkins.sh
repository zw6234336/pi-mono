#!/usr/bin/env bash

# ------------------------------------------------------------
# CI Helper: commit changes, push to remote, then trigger Jenkins
# ------------------------------------------------------------
# Required environment variables:
#   GIT_REMOTE   - optional, default "origin"
#   GIT_BRANCH   - optional, default current branch
#   JENKINS_URL - e.g. https://ci.example.com
#   JENKINS_JOB - Jenkins job name (must be configured to allow token trigger)
#   JENKINS_TOKEN - API token or job token for triggering build
# ------------------------------------------------------------

set -euo pipefail

# Determine git remote and branch
REMOTE="${GIT_REMOTE:-origin}"
BRANCH="${GIT_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"

# 1. Stage all changes
git add -A

# 2. Commit (skip if nothing to commit)
if git diff-index --quiet HEAD --; then
  echo "No changes to commit."
else
  COMMIT_MSG="[CI] Auto commit on $(date '+%Y-%m-%d %H:%M:%S')"
  git commit -m "${COMMIT_MSG}"
fi

# 3. Push to remote
git push "${REMOTE}" "${BRANCH}"

# 4. Trigger Jenkins job via HTTP API
if [[ -z "${JENKINS_URL}" || -z "${JENKINS_JOB}" || -z "${JENKINS_TOKEN}" ]]; then
  echo "Jenkins environment variables not set. Skipping trigger."
  exit 0
fi

TRIGGER_URL="${JENKINS_URL}/job/${JENKINS_JOB}/build?token=${JENKINS_TOKEN}"
echo "Triggering Jenkins job at ${TRIGGER_URL}"
curl -X POST "${TRIGGER_URL}" --silent --show-error --fail

echo "Jenkins trigger completed."
