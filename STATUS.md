# Requirement Coverage

Tracks implementation status of each requirement in [SPEC.md](/SPEC.md).

**Last updated:** 2026-07-31

Locations name the file and the enclosing symbol rather than a line range, so an
edit elsewhere in the same file leaves the row correct. `git grep` the symbol to
land on it.

## Summary

| Status  | Count |
|---------|-------|
| Covered | 101   |
| Total   | 101   |

## Pre-flight Checks

| ID    | Description                | Status  | Location                        |
|-------|----------------------------|---------|---------------------------------|
| PF-01 | Repository root            | Covered | `src/git.ts` (`preflightChecks`)|
| PF-02 | Git version                | Covered | `src/git.ts` (`preflightChecks`)|
| PF-03 | Push config                | Covered | `src/git.ts` (`preflightChecks`)|
| PF-04 | Fetch                      | Covered | `src/git.ts` (`ensureFetched`)  |
| PF-05 | `GIT_FI_NO_FETCH` skips fetch | Covered | `src/git.ts` (`ensureFetched`) |

## Global Options

| ID     | Description | Status  | Location               |
|--------|-------------|---------|------------------------|
| OPT-01 | `--debug`   | Covered | `src/index.ts` (`parseArgs`), `src/help.ts` (`OPTIONS`) |
| OPT-02 | `--bare`    | Covered | `src/index.ts` (`parseArgs`), `src/help.ts` (`OPTIONS`) |
| OPT-03 | `--json`    | Covered | `src/index.ts` (`parseArgs`), `src/help.ts` (`OPTIONS`) |
| OPT-04 | `--select`  | Covered | `src/index.ts` (`parseArgs`), `src/help.ts` (`OPTIONS`) |
| OPT-05 | `--version` | Covered | `src/index.ts` (`parseArgs`), `src/help.ts` (`OPTIONS`) |
| OPT-06 | `--help`    | Covered | `src/index.ts` (`parseArgs`), `src/help.ts` (`renderHelp`) |
| OPT-07 | `--yes`     | Covered | `src/index.ts` (`parseArgs`), `src/help.ts` (`OPTIONS`) |
| OPT-08 | `--bare`/`--json` any action | Covered | `src/merge.ts` (`mergeProcess`), `src/commands.ts` (`cmdList`, `cmdAbort`) |
| OPT-09 | `--select` excludes machine modes | Covered | `src/index.ts` (`parseArgs`) |

## Help & Documentation

| ID     | Description          | Status  | Location                  |
|--------|----------------------|---------|---------------------------|
| HLP-01 | `help` subcommand    | Covered | `src/index.ts` (`parseArgs`), `src/help.ts` (`renderHelp`) |
| HLP-02 | Man page             | Covered | `man/git-fi.1` (generated), `package.json` (`man`), `scripts/gen-docs.ts` |

## Shell Completion

| ID     | Description                 | Status  | Location                  |
|--------|-----------------------------|---------|---------------------------|
| CMP-01 | bash + zsh completion       | Covered | `scripts/completion/git-fi.bash.tmpl`, `scripts/completion/git-fi.zsh.tmpl` |
| CMP-02 | Both `git fi` dispatch providers | Covered | `scripts/completion/git-fi.bash.tmpl` (`$words`), `scripts/completion/git-fi.zsh.tmpl` (trailing `_git-fi "$@"`), `completions/_git_fi`, `completions/_git-fi` |
| CMP-03 | Action-aware branch offering| Covered | `scripts/completion/git-fi.bash.tmpl`, `scripts/completion/git-fi.zsh.tmpl` |
| CMP-04 | Offline membership          | Covered | `scripts/completion/git-fi.bash.tmpl` (`GIT_FI_NO_FETCH`), `src/git.ts` (`ensureFetched`) |
| CMP-05 | `install-completions` subcommand | Covered | `src/install-completions.ts` (`scriptFor`, `installCompletions`), `src/index.ts` (`parseArgs`) |
| CMP-06 | `--write <dir>` onto the fpath | Covered | `src/install-completions.ts` (`writeToFpath`) |
| CMP-07 | Completion installed on `npm i -g` | Covered | `scripts/postinstall.mjs`, `package.json` (`postinstall`, `files`) |

## Terminal Output

| ID     | Description                  | Status  | Location              |
|--------|------------------------------|---------|-----------------------|
| TRM-01 | `fi` styled as code token    | Covered | `src/style.ts` (`makeStyle`) |
| TRM-02 | Base 8 ANSI colors only      | Covered | `src/style.ts` (`makeStyle`) |
| TRM-03 | Text attributes for emphasis | Covered | `src/style.ts` (`makeStyle`) |
| TRM-04 | Color assignments            | Covered | `src/style.ts` (`makeStyle`), `src/merge.ts` (`mergeProcess`) |
| TRM-05 | Color disabled conditions    | Covered | `src/style.ts` (`colorEnabled`) |
| TRM-06 | Progress on stderr           | Covered | `src/style.ts` (`createSpinner`), `src/gitlab.ts` (`fetchGitlabCI`) |
| TRM-07 | Suppress progress when !TTY  | Covered | `src/style.ts` (`progressEnabled`) |
| TRM-08 | Annotation lifecycle         | Covered | `src/merge.ts` (`mergeProcess`: `updateAnnotation`, `finalizeDone`, `finalizeError`) |

## Branch Name Resolution

| ID    | Description              | Status  | Location               |
|-------|--------------------------|---------|------------------------|
| BR-01 | Prepend `origin/`        | Covered | `src/git.ts` (`resolveBranchName`) |
| BR-02 | Default to current branch| Covered | `src/git.ts` (`resolveBranches`, `currentBranchName`) |
| BR-03 | Existence check on add   | Covered | `src/git.ts` (`resolveBranches`) |
| BR-04 | No check on remove       | Covered | `src/git.ts` (`resolveBranches`) |
| BR-05 | Default branch detection | Covered | `src/git.ts` (`defaultBranch`, `resolveDefaultBranch`) |

## List Command

| ID    | Description          | Status  | Location                  |
|-------|----------------------|---------|---------------------------|
| LS-01 | Precondition check + bootstrap hint | Covered | `src/commands.ts` (`cmdList`) |
| LS-02 | Bare mode            | Covered | `src/commands.ts` (`cmdList`) |
| LS-03 | Normal mode / CI     | Covered | `src/commands.ts` (`cmdList`) |
| LS-04 | Hint suppression     | Covered | `src/commands.ts` (`cmdList`) |
| LS-05 | Filter mode          | Covered | `src/commands.ts` (`cmdList`) |
| LS-06 | Insertion order      | Covered | `src/git.ts` (`parseBranchList`) |
| LS-07 | Empty list omits table | Covered | `src/style.ts` (`printTable`) |

## Interactive Selection

| ID     | Description                 | Status  | Location                  |
|--------|-----------------------------|---------|---------------------------|
| SEL-01 | `--select` with `--add`     | Covered | `src/commands.ts` (`cmdAdd`), `src/git.ts` (`remoteBranchesNoMergedSince`) |
| SEL-02 | `--select` with `--remove`  | Covered | `src/commands.ts` (`cmdRemove`) |
| SEL-03 | TTY requirement             | Covered | `src/index.ts` (`parseArgs`) |
| SEL-04 | Invalid combinations        | Covered | `src/index.ts` (`parseArgs`) |
| SEL-05 | Empty selection exits       | Covered | `src/commands.ts` (`cmdAdd`) |
| SEL-06 | Standalone unified picker   | Covered | `src/commands.ts` (`cmdSelect`), `src/ui.ts` (`pickBranches`) |

## Commands

| ID     | Description              | Status  | Location                   |
|--------|--------------------------|---------|----------------------------|
| AD-01  | Clean index precondition | Covered | `src/merge.ts` (`mergeProcess`) |
| AD-02  | Parse current branch list| Covered | `src/commands.ts` (`cmdAdd`) |
| AD-03  | Append and deduplicate   | Covered | `src/commands.ts` (`cmdAdd`) |
| AD-04  | Run merge                | Covered | `src/commands.ts` (`cmdAdd`) |
| CMD-01 | Remove behavior          | Covered | `src/commands.ts` (`cmdRemove`) |
| CMD-02 | Remove non-existent noop | Covered | `src/commands.ts` (`cmdRemove`) |
| CMD-03 | Force replaces list      | Covered | `src/commands.ts` (`cmdForce`) |
| CMD-04 | Force with no branches   | Covered | `src/commands.ts` (`cmdForce`) |
| CMD-05 | Again re-merges and prunes | Covered | `src/commands.ts` (`cmdAgain`), `src/merge.ts` (`mergeProcess`) |
| CMD-06 | Abort re-pulls fi, then lists | Covered | `src/commands.ts` (`cmdAbort`) |
| CMD-07 | Abort no origin/fi       | Covered | `src/commands.ts` (`cmdAbort`) |

## Merge Process

| ID    | Description              | Status  | Location                  |
|-------|--------------------------|---------|---------------------------|
| MG-01 | Ambiguous ref check      | Covered | `src/merge.ts` (`mergeProcess`) |
| MG-02 | Dirty index check        | Covered | `src/merge.ts` (`mergeProcess`) |
| MG-03 | Capture untracked        | Covered | `src/merge.ts` (`mergeProcess`) |
| MG-04 | Fetch                    | Covered | `src/merge.ts` (`mergeProcess`), `src/git.ts` (`ensureFetched`) |
| MG-05 | Bootstrap confirmation   | Covered | `src/merge.ts` (`mergeProcess`), `src/ui.ts` (`confirm`) |
| MG-06 | Prune dead branches      | Covered | `src/merge.ts` (`mergeProcess`) |
| MG-07 | Warn about merged        | Covered | `src/merge.ts` (`mergeProcess`) |
| MG-08 | Create temp fi branch    | Covered | `src/merge.ts` (`mergeProcess`) |
| MG-09 | Merge command            | Covered | `src/merge.ts` (`mergeProcess`) |
| MG-10 | On success               | Covered | `src/merge.ts` (`mergeProcess`) |
| MG-11 | On failure               | Covered | `src/merge.ts` (`mergeProcess`) |
| MG-12 | Cleanup                  | Covered | `src/merge.ts` (`mergeProcess`) |
| MG-13 | CI commit message        | Covered | `src/merge.ts` (`buildCommitMessage`) |
| MG-14 | Bootstrap link           | Covered | `src/ui.ts` (`confirm`) |
| MG-15 | Bootstrap confirmation / `--yes` | Covered | `src/merge.ts` (`mergeProcess`) |

## Branch List Storage

| ID    | Description           | Status  | Location                |
|-------|-----------------------|---------|-------------------------|
| BL-01 | Preferred (terse) format | Covered | `src/merge.ts` (`buildTerseSignature`) |
| BL-02 | Parsing (reads both)  | Covered | `src/git.ts` (`parseBranchList`) |
| BL-03 | Legacy format + read detection | Covered | `src/git.ts` (`detectCommitFormat`, `parseBranchList`), `src/merge.ts` (`buildLegacyMessage`) |
| BL-04 | Write format pinned to legacy for rollout | Covered | `src/merge.ts` (`DEFAULT_WRITE_FORMAT`, `mergeProcess`) |

## Formatting

| ID     | Description      | Status  | Location               |
|--------|------------------|---------|------------------------|
| FMT-01 | Bullet list      | Covered | `src/style.ts` (`bulletList`) |
| FMT-02 | Annotation line  | Covered | `src/merge.ts` (`mergeProcess`) |

## GitLab CI

| ID    | Description         | Status  | Location                  |
|-------|---------------------|---------|---------------------------|
| GL-01 | CI status table      | Covered | `src/gitlab.ts` (`printCITable`) |
| GL-02 | Project detection    | Covered | `src/gitlab.ts` (`detectGitlabProject`, `parseOriginUrl`) |
| GL-03 | No fallback on fail  | Covered | `src/gitlab.ts` (`fetchGitlabCI`) |
| GL-04 | Hyperlinks (OSC 8)   | Covered | `src/style.ts` (`makeStyle`: `link`), `src/gitlab.ts` (`printCITable`) |
| GL-05 | Pipeline ID+status after merge | Covered | `src/gitlab.ts` (`fetchFiPipeline`), `src/commands.ts` (`cmdList`) |
| GL-06 | Deleted branch indicator | Covered | `src/gitlab.ts` (`fetchGitlabCI`, `printCITable`) |
| GL-07 | Bounded concurrent lookups, stable order | Covered | `src/gitlab.ts` (`API_CONCURRENCY`, `mapLimit`, `fetchGitlabCI`) |
| GL-08 | Built-in HTTP client, 10 s timeout | Covered | `src/gitlab.ts` (`API_TIMEOUT_MS`, `apiGet`) |

## JSON Output

| ID    | Description           | Status  | Location                  |
|-------|-----------------------|---------|---------------------------|
| JS-01 | JSON to stdout, human output to stderr | Covered | `src/commands.ts` (`cmdList`), `src/merge.ts` (`mergeProcess`), `src/ui.ts` (`confirm`) |
| JS-02 | CI array conditional  | Covered | `src/commands.ts` (`cmdList`) |

## Exit Codes

| ID    | Description | Status  | Location    |
|-------|-------------|---------|-------------|
| EX-01 | 0 = success | Covered | (implicit)  |
| EX-02 | Non-zero    | Covered | `src/style.ts` (`abort`) |

## Performance

| ID     | Description                    | Status  | Location                       |
|--------|--------------------------------|---------|--------------------------------|
| PRF-01 | Batched git queries, not per-branch | Covered | `src/git.ts` (`listRemoteBranches`, `existingRemoteRefs`, `mergedRemoteBranches`), `src/merge.ts` (`mergeProcess`) |
| PRF-02 | Default branch and project memoized | Covered | `src/git.ts` (`defaultBranch`), `src/gitlab.ts` (`detectGitlabProject`) |
| PRF-03 | Concurrent GitLab API calls    | Covered | `src/gitlab.ts` (`mapLimit`, `fetchGitlabCI`) |

## Platform

| ID     | Description        | Status  | Location              |
|--------|--------------------|---------|-----------------------|
| PLT-01 | Stderr suppression | Covered | `src/git.ts` (`git`)  |

## Update Notification

| ID     | Description              | Status  | Location                       |
|--------|--------------------------|---------|--------------------------------|
| UPD-01 | Deferred update notice   | Covered | `src/update-check.ts` (`notifyUpdate`) |
| UPD-02 | Throttled background check | Covered | `src/update-check.ts` (`notifyUpdate`), `src/update-worker.ts` |
| UPD-03 | Suppression conditions   | Covered | `src/update-check.ts` (`suppressed`) |
| UPD-04 | Cache location           | Covered | `src/update-check.ts` (`cachePath`) |
