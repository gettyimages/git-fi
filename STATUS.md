# Requirement Coverage

Tracks implementation status of each requirement in [SPEC.md](/SPEC.md).

**Last updated:** 2026-09-03

Locations name the file and the enclosing symbol rather than a line range, so an
edit elsewhere in the same file leaves the row correct. `git grep` the symbol to
land on it.

## Summary

| Status  | Count |
|---------|-------|
| Covered | 123   |
| Total   | 123   |

## Pre-flight Checks

| ID    | Description                | Status  | Location                        |
|-------|----------------------------|---------|---------------------------------|
| PRE-01 | Repository root            | Covered | `src/git.ts` (`preflightChecks`)|
| PRE-02 | Git version                | Covered | `src/git.ts` (`preflightChecks`)|
| PRE-03 | Push config                | Covered | `src/git.ts` (`preflightChecks`)|
| PRE-04 | Fetch                      | Covered | `src/git.ts` (`ensureFetched`)  |
| PRE-05 | `GIT_FI_NO_FETCH` skips fetch | Covered | `src/git.ts` (`ensureFetched`) |

## Global Options

| ID     | Description | Status  | Location               |
|--------|-------------|---------|------------------------|
| OPTION-01 | `--debug`   | Covered | `src/index.ts` (`parseArgs`), `src/help.ts` (`OPTIONS`) |
| OPTION-02 | `--bare`    | Covered | `src/index.ts` (`parseArgs`), `src/help.ts` (`OPTIONS`) |
| OPTION-03 | `--json`    | Covered | `src/index.ts` (`parseArgs`), `src/help.ts` (`OPTIONS`) |
| OPTION-04 | `--select`  | Covered | `src/index.ts` (`parseArgs`), `src/help.ts` (`OPTIONS`) |
| OPTION-05 | `--version` | Covered | `src/index.ts` (`parseArgs`), `src/help.ts` (`OPTIONS`) |
| OPTION-06 | `--help`    | Covered | `src/index.ts` (`parseArgs`), `src/help.ts` (`renderHelp`) |
| OPTION-07 | `--yes`     | Covered | `src/index.ts` (`parseArgs`), `src/help.ts` (`OPTIONS`) |
| OPTION-08 | `--bare`/`--json` any action | Covered | `src/merge.ts` (`mergeProcess`), `src/commands.ts` (`cmdList`, `cmdAbort`) |
| OPTION-09 | `--select` excludes machine modes | Covered | `src/index.ts` (`parseArgs`) |
| OPTION-11 | `--debug` traces and times every git call | Covered | `src/git.ts` (`setDebug`, `git`), `src/index.ts` (`main`) |
| OPTION-10 | `--update`  | Covered | `src/index.ts` (`parseArgs`, `main`), `src/help.ts` (`OPTIONS`) |
| OPTION-12 | `--auth[=<action>]` | Covered | `src/index.ts` (`parseArgs`, `main`), `src/help.ts` (`OPTIONS`, `flagLabel`) |
| OPTION-13 | `--host <hostname>` | Covered | `src/index.ts` (`parseArgs`), `src/help.ts` (`OPTIONS`) |

## Help & Documentation

| ID     | Description          | Status  | Location                  |
|--------|----------------------|---------|---------------------------|
| HELP-01 | `help` subcommand    | Covered | `src/index.ts` (`parseArgs`), `src/help.ts` (`renderHelp`) |
| HELP-02 | Man page             | Covered | `man/git-fi.1` (generated), `package.json` (`man`), `scripts/gen-docs.ts` |

## Shell Completion

| ID     | Description                 | Status  | Location                  |
|--------|-----------------------------|---------|---------------------------|
| COMPLETE-01 | bash + zsh completion       | Covered | `scripts/completion/git-fi.bash.tmpl`, `scripts/completion/git-fi.zsh.tmpl` |
| COMPLETE-02 | Both `git fi` dispatch providers | Covered | `scripts/completion/git-fi.bash.tmpl` (`$words`), `scripts/completion/git-fi.zsh.tmpl` (trailing `_git-fi "$@"`), `completions/_git_fi`, `completions/_git-fi` |
| COMPLETE-03 | Action-aware branch offering| Covered | `scripts/completion/git-fi.bash.tmpl`, `scripts/completion/git-fi.zsh.tmpl` |
| COMPLETE-04 | Offline membership          | Covered | `scripts/completion/git-fi.bash.tmpl` (`GIT_FI_NO_FETCH`), `src/git.ts` (`ensureFetched`) |
| COMPLETE-05 | `install-completions` subcommand | Covered | `src/install-completions.ts` (`scriptFor`, `installCompletions`), `src/index.ts` (`parseArgs`) |
| COMPLETE-06 | `--write <dir>` onto the fpath | Covered | `src/install-completions.ts` (`writeToFpath`) |
| COMPLETE-07 | Completion installed on `npm i -g` | Covered | `scripts/postinstall.mjs`, `package.json` (`postinstall`, `files`) |

## Terminal Output

| ID     | Description                  | Status  | Location              |
|--------|------------------------------|---------|-----------------------|
| TERM-01 | `fi` styled as code token    | Covered | `src/style.ts` (`makeStyle`) |
| TERM-02 | Base 8 ANSI colors only      | Covered | `src/style.ts` (`makeStyle`) |
| TERM-03 | Text attributes for emphasis | Covered | `src/style.ts` (`makeStyle`) |
| TERM-04 | Color assignments            | Covered | `src/style.ts` (`makeStyle`), `src/merge.ts` (`mergeProcess`) |
| TERM-05 | Color disabled conditions    | Covered | `src/style.ts` (`colorEnabled`) |
| TERM-06 | Progress on stderr           | Covered | `src/style.ts` (`createSpinner`), `src/gitlab.ts` (`fetchGitlabCI`) |
| TERM-07 | Suppress progress when !TTY  | Covered | `src/style.ts` (`progressEnabled`) |
| TERM-08 | Annotation lifecycle         | Covered | `src/merge.ts` (`mergeProcess`: `updateAnnotation`, `finalizeDone`, `finalizeError`) |
| TERM-09 | Off-TTY: outcome line only   | Covered | `src/merge.ts` (`ACTION_OUTCOME`, `mergeProcess`: `finalizeDone`) |
| TERM-10 | Status worded without glyphs | Covered | `src/gitlab.ts` (`statusLabel`, `STATUS_WORD`), `src/commands.ts` (`cmdList`) |

## Branch Name Resolution

| ID    | Description              | Status  | Location               |
|-------|--------------------------|---------|------------------------|
| BRANCH-01 | Prepend `origin/`        | Covered | `src/git.ts` (`resolveBranchName`) |
| BRANCH-02 | Default to current branch| Covered | `src/git.ts` (`resolveBranches`, `currentBranchName`) |
| BRANCH-03 | Existence check on add   | Covered | `src/git.ts` (`resolveBranches`) |
| BRANCH-04 | No check on remove       | Covered | `src/git.ts` (`resolveBranches`) |
| BRANCH-05 | Default branch detection | Covered | `src/git.ts` (`defaultBranch`, `resolveDefaultBranch`) |

## List Command

| ID    | Description          | Status  | Location                  |
|-------|----------------------|---------|---------------------------|
| LIST-01 | Precondition check + bootstrap hint | Covered | `src/commands.ts` (`cmdList`) |
| LIST-02 | Bare mode            | Covered | `src/commands.ts` (`cmdList`) |
| LIST-03 | Normal mode / CI     | Covered | `src/commands.ts` (`cmdList`) |
| LIST-04 | Hint suppression     | Covered | `src/style.ts` (`hintsEnabled`), `src/commands.ts` (`cmdList`) |
| LIST-05 | Filter mode          | Covered | `src/commands.ts` (`cmdList`) |
| LIST-06 | Insertion order      | Covered | `src/git.ts` (`parseBranchList`) |
| LIST-07 | Empty list shows `(no branches)` | Covered | `src/style.ts` (`printTable`, `makeStyle`), `src/commands.ts` (`cmdList`) |

## Interactive Selection

| ID     | Description                 | Status  | Location                  |
|--------|-----------------------------|---------|---------------------------|
| SELECT-01 | `--select` with `--add`     | Covered | `src/commands.ts` (`cmdAdd`), `src/git.ts` (`remoteBranchesNoMergedSince`) |
| SELECT-02 | `--select` with `--remove`  | Covered | `src/commands.ts` (`cmdRemove`) |
| SELECT-03 | TTY requirement             | Covered | `src/index.ts` (`parseArgs`) |
| SELECT-04 | Invalid combinations        | Covered | `src/index.ts` (`parseArgs`) |
| SELECT-05 | Empty selection exits       | Covered | `src/commands.ts` (`cmdAdd`) |
| SELECT-06 | Standalone unified picker   | Covered | `src/commands.ts` (`cmdSelect`), `src/ui.ts` (`pickBranches`) |

## Commands

| ID     | Description              | Status  | Location                   |
|--------|--------------------------|---------|----------------------------|
| ADD-01  | Clean index precondition | Covered | `src/merge.ts` (`mergeProcess`) |
| ADD-02  | Parse current branch list| Covered | `src/commands.ts` (`cmdAdd`) |
| ADD-03  | Append and deduplicate   | Covered | `src/commands.ts` (`cmdAdd`) |
| ADD-04  | Run merge                | Covered | `src/commands.ts` (`cmdAdd`) |
| COMMAND-01 | Remove behavior          | Covered | `src/commands.ts` (`cmdRemove`) |
| COMMAND-02 | Remove non-existent noop | Covered | `src/commands.ts` (`cmdRemove`) |
| COMMAND-03 | Force replaces list      | Covered | `src/commands.ts` (`cmdForce`) |
| COMMAND-04 | Force with no branches   | Covered | `src/commands.ts` (`cmdForce`) |
| COMMAND-05 | Again re-merges and prunes | Covered | `src/commands.ts` (`cmdAgain`), `src/merge.ts` (`mergeProcess`) |
| COMMAND-06 | Abort re-pulls fi, then lists | Covered | `src/commands.ts` (`cmdAbort`) |
| COMMAND-07 | Abort no origin/fi       | Covered | `src/commands.ts` (`cmdAbort`) |

## Merge Process

| ID    | Description              | Status  | Location                  |
|-------|--------------------------|---------|---------------------------|
| MERGE-01 | Ambiguous ref check      | Covered | `src/merge.ts` (`mergeProcess`) |
| MERGE-02 | Tracked-file dirty check | Covered | `src/merge.ts` (`mergeProcess`) |
| MERGE-03 | Capture untracked        | Covered | `src/merge.ts` (`mergeProcess`) |
| MERGE-04 | Fetch                    | Covered | `src/merge.ts` (`mergeProcess`), `src/git.ts` (`ensureFetched`) |
| MERGE-05 | Bootstrap confirmation   | Covered | `src/merge.ts` (`mergeProcess`), `src/ui.ts` (`confirm`) |
| MERGE-06 | Prune dead branches      | Covered | `src/merge.ts` (`mergeProcess`) |
| MERGE-07 | Warn about merged        | Covered | `src/merge.ts` (`mergeProcess`) |
| MERGE-08 | Create temp fi branch    | Covered | `src/merge.ts` (`mergeProcess`) |
| MERGE-09 | Merge command            | Covered | `src/merge.ts` (`mergeProcess`) |
| MERGE-10 | On success               | Covered | `src/merge.ts` (`mergeProcess`) |
| MERGE-11 | On failure               | Covered | `src/merge.ts` (`mergeProcess`) |
| MERGE-12 | Cleanup                  | Covered | `src/merge.ts` (`mergeProcess`) |
| MERGE-13 | CI commit message        | Covered | `src/merge.ts` (`buildCommitMessage`) |
| MERGE-14 | Bootstrap link           | Covered | `src/ui.ts` (`confirm`) |
| MERGE-15 | Bootstrap confirmation / `--yes` | Covered | `src/merge.ts` (`mergeProcess`) |

## Branch List Storage

| ID    | Description           | Status  | Location                |
|-------|-----------------------|---------|-------------------------|
| STORAGE-01 | Preferred (terse) format | Covered | `src/merge.ts` (`buildTerseSignature`) |
| STORAGE-02 | Parsing (reads both)  | Covered | `src/git.ts` (`parseBranchList`) |
| STORAGE-03 | Legacy format + read detection | Covered | `src/git.ts` (`detectCommitFormat`, `parseBranchList`), `src/merge.ts` (`buildLegacyMessage`) |
| STORAGE-04 | Write format pinned to legacy for rollout | Covered | `src/merge.ts` (`DEFAULT_WRITE_FORMAT`, `mergeProcess`) |

## Formatting

| ID     | Description      | Status  | Location               |
|--------|------------------|---------|------------------------|
| FORMAT-01 | Bullet list      | Covered | `src/style.ts` (`bulletList`) |
| FORMAT-02 | Annotation line  | Covered | `src/merge.ts` (`mergeProcess`) |

## Authentication

| ID    | Description         | Status  | Location                  |
|-------|---------------------|---------|---------------------------|
| AUTH-01 | Resolution order, `$CI` reversal | Covered | `src/auth.ts` (`resolveToken`, `computeResolution`), `src/gitlab.ts` (`gitlabToken`) |
| AUTH-02 | Memoized once per run | Covered | `src/auth.ts` (`resolveToken`, `resolutionCache`) |
| AUTH-03 | `config.json` location, per-host shape | Covered | `src/auth.ts` (`configPath`, `readConfig`, `storeToken`, `SCHEMA_VERSION`) |
| AUTH-04 | 0700/0600, refuse loose modes | Covered | `src/auth.ts` (`readConfig`, `writeConfig`, `POSIX_MODES`) |
| AUTH-05 | Action as a flag value, not a subcommand | Covered | `src/index.ts` (`parseArgs`), `src/help.ts` (`OPTIONS`) |
| AUTH-06 | `login` / `status` / `logout` | Covered | `src/auth.ts` (`cmdAuth`), `src/index.ts` (`parseArgs`, `main`) |
| AUTH-07 | Host from origin, `--host` override | Covered | `src/index.ts` (`parseArgs`, `main`), `src/auth.ts` (`requireHost`) |
| AUTH-08 | Token from stdin only | Covered | `src/auth.ts` (`readSecret`, `authLogin`) |
| AUTH-09 | Validate, warn on excess scope | Covered | `src/auth.ts` (`inspectToken`, `excessScopes`, `authLogin`) |
| AUTH-10 | Prefilled token form link | Covered | `src/auth.ts` (`tokenFormUrl`, `authLogin`) |
| AUTH-11 | Status fields, redaction, shadowing | Covered | `src/auth.ts` (`authStatus`, `tokenTail`) |
| AUTH-12 | Completion offers the three verbs | Covered | `src/help.ts` (`OPTIONS`: `values`), `scripts/gen-docs.ts` (`valuedFlagArms`, `zshSpec`) |

## GitLab CI

| ID    | Description         | Status  | Location                  |
|-------|---------------------|---------|---------------------------|
| GITLAB-01 | CI status table      | Covered | `src/gitlab.ts` (`printCITable`) |
| GITLAB-02 | Project detection    | Covered | `src/gitlab.ts` (`detectGitlabProject`, `parseOriginUrl`) |
| GITLAB-03 | No fallback on fail  | Covered | `src/gitlab.ts` (`fetchGitlabCI`) |
| GITLAB-04 | Hyperlinks (OSC 8), compare target | Covered | `src/style.ts` (`hyperlinksEnabled`, `makeStyle`: `link`), `src/gitlab.ts` (`branchCompareUrl`, `printCITable`) |
| GITLAB-05 | Pipeline ID+status after merge | Covered | `src/gitlab.ts` (`fetchFiPipeline`), `src/commands.ts` (`cmdList`) |
| GITLAB-06 | Deleted branch indicator | Covered | `src/gitlab.ts` (`fetchGitlabCI`, `printCITable`) |
| GITLAB-07 | Bounded concurrent lookups, stable order | Covered | `src/gitlab.ts` (`API_CONCURRENCY`, `mapLimit`, `fetchGitlabCI`) |
| GITLAB-08 | Built-in HTTP client, 10 s timeout | Covered | `src/gitlab.ts` (`API_TIMEOUT_MS`, `apiGet`) |
| GITLAB-09 | Markdown link off a TTY | Covered | `src/style.ts` (`makeStyle`: `linkOrMarkdown`), `src/gitlab.ts` (`printCITable`), `src/commands.ts` (`cmdList`) |

## JSON Output

| ID    | Description           | Status  | Location                  |
|-------|-----------------------|---------|---------------------------|
| JSON-01 | JSON to stdout, human output to stderr | Covered | `src/commands.ts` (`cmdList`), `src/merge.ts` (`mergeProcess`), `src/ui.ts` (`confirm`) |
| JSON-02 | CI array conditional  | Covered | `src/commands.ts` (`cmdList`) |

## Exit Codes

| ID    | Description | Status  | Location    |
|-------|-------------|---------|-------------|
| EXIT-01 | 0 = success | Covered | (implicit)  |
| EXIT-02 | Non-zero    | Covered | `src/style.ts` (`abort`) |

## Performance

| ID     | Description                    | Status  | Location                       |
|--------|--------------------------------|---------|--------------------------------|
| PERF-01 | Batched git queries, not per-branch | Covered | `src/git.ts` (`listRemoteBranches`, `existingRemoteRefs`, `mergedRemoteBranches`), `src/merge.ts` (`mergeProcess`) |
| PERF-02 | Default branch and project memoized | Covered | `src/git.ts` (`defaultBranch`), `src/gitlab.ts` (`detectGitlabProject`) |
| PERF-03 | Concurrent GitLab API calls    | Covered | `src/gitlab.ts` (`mapLimit`, `fetchGitlabCI`) |

## Platform

| ID     | Description        | Status  | Location              |
|--------|--------------------|---------|-----------------------|
| PLATFORM-01 | Stderr suppression | Covered | `src/git.ts` (`git`)  |

## Build Provenance

| ID     | Description              | Status  | Location                       |
|--------|--------------------------|---------|--------------------------------|
| BUILD-01 | Dev build detection      | Covered | `src/build-info.ts` (`isDevBuild`) |
| BUILD-02 | `--version` names the commit | Covered | `src/build-info.ts` (`describeVersion`), `src/index.ts` (`parseArgs`) |

## Update Notification

| ID     | Description              | Status  | Location                       |
|--------|--------------------------|---------|--------------------------------|
| UPDATE-01 | Deferred update notice   | Covered | `src/update-check.ts` (`notifyUpdate`, `updateNotice`) |
| UPDATE-02 | Throttled background check | Covered | `src/update-check.ts` (`notifyUpdate`), `src/update-worker.ts` |
| UPDATE-03 | Suppression conditions   | Covered | `src/style.ts` (`hintsEnabled`), `src/update-check.ts` (`suppressed`), `src/build-info.ts` (`isDevBuild`) |
| UPDATE-04 | Cache location           | Covered | `src/update-check.ts` (`cachePath`) |
| UPDATE-05 | `--update` installs the latest version | Covered | `src/update-check.ts` (`updateSelf`), `src/index.ts` (`parseArgs`, `main`) |
