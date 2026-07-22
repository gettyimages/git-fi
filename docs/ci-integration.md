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

When set, `git fi` (list mode) shows each branch's pipeline status in a table, followed by a line for the `fi` branch's own pipeline:

```text
Branch         │ Date       │ Author │ Pipeline
───────────────┼────────────┼────────┼──────────
feature-auth   │ 2026-03-30 │ Alice  │ 11111 ✅
feature-search │ 2026-03-30 │ Bob    │ 22222 ⏳
fi: #12345 ⏳
```

### Status Indicators

Each pipeline's GitLab status maps to an emoji:

| Emoji | GitLab status | Meaning |
|-------|---------------|---------|
| ✅ | `success` | Pipeline succeeded |
| ❌ | `failed` | Pipeline failed |
| ⏰ | `timeout` | Pipeline timed out |
| ⏳ | `running`, `pending` | Pipeline running or queued |
| ➖ | `missing` | No pipeline found (or branch deleted) |
| ⏭️ | `skipped` | Pipeline skipped |

If `GITLAB_ACCESS_TOKEN` is unset, the list shows only a `Branch` column and the `fi:` line is omitted. A per-branch HTTP 404 (e.g. a deleted branch) is shown as `missing`; any other GitLab API error aborts with a message suggesting you unset `GITLAB_ACCESS_TOKEN` to use basic mode.

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
