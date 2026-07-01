# CI Integration

git-fi can surface each branch's pipeline status from your forge alongside the branch list, and it adds pipeline context to commits when it runs inside CI.

Forge support is pluggable: git-fi detects the forge from the `origin` remote and queries that forge's API for per-branch status. **GitLab is supported today.** Other forges slot in the same way — GitHub is the obvious next one.

| Forge | Status | Enabled with |
|-------|--------|--------------|
| GitLab | Supported | `GITLAB_ACCESS_TOKEN` |
| GitHub | Planned | — |

## GitLab

Set the `GITLAB_ACCESS_TOKEN` environment variable to enable pipeline status:

```bash
export GITLAB_ACCESS_TOKEN="glpat-xxxxxxxxxxxxxxxxxxxx"
```

When set, `git fi` (list mode) shows the pipeline status of each branch:

```text
 * feature-auth    OK
 * feature-search  RUN
 * bugfix-nav      FAIL
```

### Status Indicators

| Indicator | Meaning |
|-----------|---------|
| `OK` | Pipeline succeeded |
| `FAIL` | Pipeline failed |
| `RUN` | Pipeline is running |
| `TIME` | Pipeline timed out |
| `MISS` | No pipeline found |
| `SKIP` | Pipeline was skipped |

If the GitLab API is unreachable or returns an error, git-fi falls back to listing branches without status indicators.

## Pipeline context in CI

When git-fi runs inside a CI pipeline (`CI=true`), commit messages include pipeline context:

```text
Re-merge fi branch triggered by build 12345 due to commit on feature-auth. Was originally: --- ...

(feature-auth, feature-search)@[a1b2c3d]
```

The variables below are GitLab CI's predefined names; a future forge integration would read that forge's equivalents.

| Variable | Purpose |
|----------|---------|
| `CI` | Detected as truthy to enable CI mode |
| `CI_PIPELINE_ID` | Included in commit message for traceability |
| `CI_COMMIT_REF_NAME` | Included in commit message for traceability |

## Typical CI Workflow

This flow is forge-agnostic — it works on any CI that can run `git fi -g` after a build.

```mermaid
%%{ init: { 'look': 'handDrawn' } }%%
flowchart LR
  A[Push to feature branch] --> B[Feature branch pipeline]
  B --> C{Build passes?}
  C -- yes --> D[Post-build: git fi -g]
  D --> E[fi branch pipeline]
  E --> F[Deploy fi to staging]
  C -- no --> G[Fix and push again]
```

1. Developer pushes to a feature branch
2. Feature branch CI pipeline runs tests
3. On success, a post-build job runs `git fi -g` to rebuild `fi`
4. The updated `fi` branch triggers its own pipeline
5. The `fi` pipeline deploys to a staging/candidate environment

This gives teams a continuously updated integration environment that reflects all in-flight work.

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `GITLAB_ACCESS_TOKEN` | Enable GitLab pipeline status in branch listings |
| `GIT_FI_NO_HINTS` | Suppress hint messages |
| `NO_COLOR` | Disable color output (respects [no-color.org](https://no-color.org) convention) |
