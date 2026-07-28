# Requirement Coverage

Tracks implementation status of each requirement in [SPEC.md](/SPEC.md).

**Last updated:** 2026-07-27

## Summary

| Status  | Count |
|---------|-------|
| Covered | 98    |
| Total   | 98    |

## Pre-flight Checks

| ID    | Description                | Status  | Location                  |
|-------|----------------------------|---------|---------------------------|
| PF-01 | Repository root            | Covered | `src/git.ts:58-59`        |
| PF-02 | Git version                | Covered | `src/git.ts:62-73`        |
| PF-03 | Push config                | Covered | `src/git.ts:75-81`        |
| PF-04 | Fetch                      | Covered | `src/git.ts:90-108`       |
| PF-05 | `GIT_FI_NO_FETCH` skips fetch | Covered | `src/git.ts:92-98`     |

## Global Options

| ID     | Description | Status  | Location               |
|--------|-------------|---------|------------------------|
| OPT-01 | `--debug`   | Covered | `src/index.ts:32-35`   |
| OPT-02 | `--bare`    | Covered | `src/index.ts:36-39`   |
| OPT-03 | `--json`    | Covered | `src/index.ts:40-43`   |
| OPT-04 | `--select`  | Covered | `src/index.ts:44-47`   |
| OPT-05 | `--version` | Covered | `src/index.ts:52-55`   |
| OPT-06 | `--help`    | Covered | `src/index.ts:56-59`, `src/help.ts:65-92` |
| OPT-07 | `--yes`     | Covered | `src/index.ts:48-51`   |
| OPT-08 | `--bare`/`--json` any action | Covered | `src/merge.ts:99-111`, `src/commands.ts:73-95`, `src/commands.ts:266-269` |
| OPT-09 | `--select` excludes machine modes | Covered | `src/index.ts:126-137` |

## Help & Documentation

| ID     | Description          | Status  | Location                  |
|--------|----------------------|---------|---------------------------|
| HLP-01 | `help` subcommand    | Covered | `src/index.ts:101-104`    |
| HLP-02 | Man page             | Covered | `man/git-fi.1` (generated), `package.json:9`, `scripts/gen-docs.ts:33-50` |

## Shell Completion

| ID     | Description                 | Status  | Location                  |
|--------|-----------------------------|---------|---------------------------|
| CMP-01 | bash + zsh completion       | Covered | `scripts/completion/git-fi.bash.tmpl`, `scripts/completion/git-fi.zsh.tmpl` |
| CMP-02 | Both `git fi` dispatch providers | Covered | `scripts/completion/git-fi.bash.tmpl` (`$words`), `scripts/completion/git-fi.zsh.tmpl` (trailing `_git-fi "$@"`), `completions/_git_fi`, `completions/_git-fi` |
| CMP-03 | Action-aware branch offering| Covered | `scripts/completion/git-fi.bash.tmpl:40-61`, `scripts/completion/git-fi.zsh.tmpl:30-55` |
| CMP-04 | Offline membership          | Covered | `scripts/completion/git-fi.bash.tmpl:27`, `src/git.ts:92-98` |
| CMP-05 | `install-completions` subcommand | Covered | `src/install-completions.ts` (`bash` / `zsh` / `zsh-git`), `src/index.ts:113-125` |
| CMP-06 | `--write <dir>` onto the fpath | Covered | `src/install-completions.ts` (`writeToFpath`) |
| CMP-07 | Completion installed on `npm i -g` | Covered | `scripts/postinstall.mjs`, `package.json` (`postinstall`, `files`) |

## Terminal Output

| ID     | Description                  | Status  | Location              |
|--------|------------------------------|---------|-----------------------|
| TRM-01 | `fi` styled as code token    | Covered | `src/style.ts:29`     |
| TRM-02 | Base 8 ANSI colors only      | Covered | `src/style.ts:22-28`  |
| TRM-03 | Text attributes for emphasis | Covered | `src/style.ts:27-28`  |
| TRM-04 | Color assignments            | Covered | `src/style.ts:22-29`, `src/merge.ts:199,263` |
| TRM-05 | Color disabled conditions    | Covered | `src/style.ts:6-9`    |
| TRM-06 | Progress on stderr           | Covered | `src/style.ts:37-50`, `src/gitlab.ts:43` |
| TRM-07 | Suppress progress when !TTY  | Covered | `src/style.ts:12-14`  |
| TRM-08 | Annotation lifecycle         | Covered | `src/merge.ts:63-77,227-290` |

## Branch Name Resolution

| ID    | Description              | Status  | Location               |
|-------|--------------------------|---------|------------------------|
| BR-01 | Prepend `origin/`        | Covered | `src/git.ts:158-161`   |
| BR-02 | Default to current branch| Covered | `src/git.ts:174-179`   |
| BR-03 | Existence check on add   | Covered | `src/git.ts:182-197`   |
| BR-04 | No check on remove       | Covered | `src/git.ts:182` (skip)|
| BR-05 | Default branch detection | Covered | `src/git.ts:116-139`   |

## List Command

| ID    | Description          | Status  | Location                  |
|-------|----------------------|---------|---------------------------|
| LS-01 | Precondition check + bootstrap hint | Covered | `src/commands.ts:36-49` |
| LS-02 | Bare mode            | Covered | `src/commands.ts:59-61`   |
| LS-03 | Normal mode / CI     | Covered | `src/commands.ts:83-105`  |
| LS-04 | Hint suppression     | Covered | `src/commands.ts:109-118` |
| LS-05 | Filter mode          | Covered | `src/commands.ts:46-55`   |
| LS-06 | Insertion order      | Covered | `src/git.ts:150-156`      |
| LS-07 | Empty list omits table | Covered | `src/style.ts:114`      |

## Interactive Selection

| ID     | Description                 | Status  | Location                  |
|--------|-----------------------------|---------|---------------------------|
| SEL-01 | `--select` with `--add`     | Covered | `src/commands.ts:137-158`, `src/git.ts:250-275` |
| SEL-02 | `--select` with `--remove`  | Covered | `src/commands.ts:178-198` |
| SEL-03 | TTY requirement             | Covered | `src/index.ts:144-145`    |
| SEL-04 | Invalid combinations        | Covered | `src/index.ts:140-141`    |
| SEL-05 | Empty selection exits       | Covered | `src/commands.ts:154-157` |
| SEL-06 | Standalone unified picker   | Covered | `src/commands.ts:265-312` |

## Commands

| ID     | Description              | Status  | Location                   |
|--------|--------------------------|---------|----------------------------|
| AD-01  | Clean index precondition | Covered | `src/merge.ts:102-105`     |
| AD-02  | Parse current branch list| Covered | `src/commands.ts:155`      |
| AD-03  | Append and deduplicate   | Covered | `src/commands.ts:156`      |
| AD-04  | Run merge                | Covered | `src/commands.ts:158`      |
| CMD-01 | Remove behavior          | Covered | `src/commands.ts:162-198`  |
| CMD-02 | Remove non-existent noop | Covered | `src/commands.ts:193-194`  |
| CMD-03 | Force replaces list      | Covered | `src/commands.ts:200-208`  |
| CMD-04 | Force with no branches   | Covered | `src/commands.ts:204-205`  |
| CMD-05 | Again re-merges and prunes | Covered | `src/commands.ts:219-242`, `src/merge.ts:152-178` |
| CMD-06 | Abort re-pulls fi, then lists | Covered | `src/commands.ts:246-269`  |
| CMD-07 | Abort no origin/fi       | Covered | `src/commands.ts:257-259`  |

## Merge Process

| ID    | Description              | Status  | Location                  |
|-------|--------------------------|---------|---------------------------|
| MG-01 | Ambiguous ref check      | Covered | `src/merge.ts:93-100`     |
| MG-02 | Dirty index check        | Covered | `src/merge.ts:102-105`    |
| MG-03 | Capture untracked        | Covered | `src/merge.ts:107-110`    |
| MG-04 | Fetch                    | Covered | `src/merge.ts:111`        |
| MG-05 | Bootstrap confirmation   | Covered | `src/merge.ts:127-139`    |
| MG-06 | Prune dead branches      | Covered | `src/merge.ts:152-164`    |
| MG-07 | Warn about merged        | Covered | `src/merge.ts:166-176`    |
| MG-08 | Create temp fi branch    | Covered | `src/merge.ts:296-298`, `src/merge.ts:337-339` |
| MG-09 | Merge command            | Covered | `src/merge.ts:352-366`    |
| MG-10 | On success               | Covered | `src/merge.ts:368-401`    |
| MG-11 | On failure               | Covered | `src/merge.ts:402-446`    |
| MG-12 | Cleanup                  | Covered | `src/merge.ts:390-397`, `src/merge.ts:419-426` |
| MG-13 | CI commit message        | Covered | `src/merge.ts:46-57`      |
| MG-14 | Bootstrap link           | Covered | `src/ui.ts:143`           |
| MG-15 | Bootstrap confirmation / `--yes` | Covered | `src/merge.ts:128-145` |

## Branch List Storage

| ID    | Description           | Status  | Location                |
|-------|-----------------------|---------|-------------------------|
| BL-01 | Preferred (terse) format | Covered | `src/merge.ts:43-48`  |
| BL-02 | Parsing (reads both)  | Covered | `src/git.ts:139-166`    |
| BL-03 | Legacy format + read detection | Covered | `src/git.ts:130-137` |
| BL-04 | Write format pinned to legacy for rollout | Covered | `src/merge.ts:28`, `src/merge.ts:127-131` |

## Formatting

| ID     | Description      | Status  | Location               |
|--------|------------------|---------|------------------------|
| FMT-01 | Bullet list      | Covered | `src/style.ts:74-95`   |
| FMT-02 | Annotation line  | Covered | `src/merge.ts:227-245` |

## GitLab CI

| ID    | Description         | Status  | Location                  |
|-------|---------------------|---------|---------------------------|
| GL-01 | CI status table      | Covered | `src/gitlab.ts:247-272`   |
| GL-02 | Project detection    | Covered | `src/gitlab.ts:29-47`     |
| GL-03 | No fallback on fail  | Covered | `src/gitlab.ts:162-183`   |
| GL-04 | Hyperlinks (OSC 8)   | Covered | `src/style.ts:30-31`, `src/gitlab.ts:259-267` |
| GL-05 | Pipeline ID+status after merge | Covered | `src/gitlab.ts:194-245`, `src/commands.ts:97-105` |
| GL-06 | Deleted branch indicator | Covered | `src/gitlab.ts:114-119`, `src/gitlab.ts:145-146`, `src/gitlab.ts:256-257` |
| GL-07 | Bounded concurrent lookups, stable order | Covered | `src/gitlab.ts:20`, `src/gitlab.ts:63-79`, `src/gitlab.ts:164-183` |
| GL-08 | Built-in HTTP client, 10 s timeout | Covered | `src/gitlab.ts:15`, `src/gitlab.ts:54-60` |

## JSON Output

| ID    | Description           | Status  | Location                  |
|-------|-----------------------|---------|---------------------------|
| JS-01 | JSON to stdout, human output to stderr | Covered | `src/commands.ts:78-95`, `src/merge.ts:99-111`, `src/ui.ts:135-152` |
| JS-02 | CI array conditional  | Covered | `src/commands.ts:83-92`   |

## Exit Codes

| ID    | Description | Status  | Location    |
|-------|-------------|---------|-------------|
| EX-01 | 0 = success | Covered | (implicit)  |
| EX-02 | Non-zero    | Covered | `src/style.ts:130-134` |

## Performance

| ID     | Description                    | Status  | Location                       |
|--------|--------------------------------|---------|--------------------------------|
| PRF-01 | Batched git queries, not per-branch | Covered | `src/git.ts:250-271`, `src/git.ts:295-312`, `src/merge.ts:152-176` |
| PRF-02 | Default branch and project memoized | Covered | `src/git.ts:116-121`, `src/gitlab.ts:27-35` |
| PRF-03 | Concurrent GitLab API calls    | Covered | `src/gitlab.ts:63-79`, `src/gitlab.ts:164` |

## Platform

| ID     | Description        | Status  | Location              |
|--------|--------------------|---------|-----------------------|
| PLT-01 | Stderr suppression | Covered | `src/git.ts:25-26`    |

## Update Notification

| ID     | Description              | Status  | Location                       |
|--------|--------------------------|---------|--------------------------------|
| UPD-01 | Deferred update notice   | Covered | `src/update-check.ts:48-57`    |
| UPD-02 | Throttled background check | Covered | `src/update-check.ts:59-69`, `src/update-worker.ts` |
| UPD-03 | Suppression conditions   | Covered | `src/update-check.ts:27-36`    |
| UPD-04 | Cache location           | Covered | `src/update-check.ts:10-13`    |
