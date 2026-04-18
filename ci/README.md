# CI Helper for pi-mono

This folder contains a simple helper script that automates the typical CI workflow:

1. **Stage & commit** any local changes.
2. **Push** to the configured remote (defaults to `origin` and the current branch).
3. **Trigger** a Jenkins job via an HTTP POST request.

## Usage
```bash
# Export required variables (once per session)
export JENKINS_URL="https://ci.example.com"
export JENKINS_JOB="pi-mono-build"
export JENKINS_TOKEN="your-token-here"

# Run the CI helper (will commit, push, then trigger Jenkins)
npm run ci-trigger
```

- `GIT_REMOTE` and `GIT_BRANCH` can be overridden if you need to push to a different remote or branch.
- Ensure the Jenkins job is configured to allow **Remote Trigger** with the token you provide.
- The script will exit gracefully if no changes are detected or if the Jenkins environment variables are missing.
