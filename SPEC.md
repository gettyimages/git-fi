# git-fi Specification

## Overview

git-fi is a git plugin that maintains a temporary integration branch named `fi`. It merges multiple in-progress feature branches together so teams can detect merge conflicts early and test features in collaboration rather than isolation.

The `fi` branch is ephemeral — it is force-pushed on every operation and should never be manually committed to.

## Invocation

```
git fi [options] [<branch>...]
```

git-fi is invoked as a git subcommand. It must be run from the repository root (a `.git` directory must exist in the current working directory).

## `PRE`

Pre-flight Checks

Before any command executes, git-fi runs the following pre-flight checks:

1. `PRE-01` If no `.git` directory exists in the current working directory, then git-fi shall abort with `No .git directory found.` followed by a line pointing to the documentation site (`https://gettyimages.github.io/git-fi/#/`) for newcomers.
2. `PRE-02` If the git version is below 2.13.0, then git-fi shall abort with: `git version X is too old, please upgrade to at least 2.13.0.` The floor is set by `git branch -r --format=...`, which the batched branch listing depends on (`PERF-01`) and which git gained in 2.13.0; every other git invocation git-fi makes predates it. An implementation that reaches the same listing another way may state its own floor here.
3. `PRE-03` If `git config push.default` is `upstream` or `tracking`, then git-fi shall abort with: `Your default git push config is set to a hazardous option.`
4. `PRE-04` git-fi shall run `git fetch --quiet --prune --no-tags origin` once per invocation, memoizing to avoid redundant fetches. `--no-tags` because git-fi reads branches and never a tag, so asking for the tag refspec buys nothing it uses. What that saves is server-dependent and can be large: on one GitLab project, paired runs measured 12–15 s with tags against 1–2 s without, repeatably and while transferring no tags at all (the local and remote tag sets were identical); on another project of similar size and tag count on the same host, both forms took about a second. Tag count, missing tags, annotated-vs-lightweight, and repo size were each ruled out as the difference, so the cost is something server-side that git-fi can only decline to pay, not predict. A consequence worth knowing: `git fi` no longer refreshes tags as a side effect, so a stale tag is `git fetch`'s job rather than this one's.
5. `PRE-05` Where `GIT_FI_NO_FETCH` is set, git-fi shall skip the fetch (`PRE-04`) on read-only operations (`list`) and operate on the already-fetched remote-tracking refs. Shell completion sets this so tab-completion stays offline. Mutating operations always fetch regardless, so an integration merge never builds on stale refs. (All environment variables are catalogued in [Environment Variables](#environment-variables).)

```mermaid
%%{ init: { 'look': 'handDrawn' } }%%
flowchart TD
    A[git fi invoked] --> B{.git exists?}
    B -- no --> B1[ABORT: No .git directory found]
    B -- yes --> C{git >= 2.13.0?}
    C -- no --> C1[ABORT: git version too old]
    C -- yes --> D{push.default safe?}
    D -- no --> D1[ABORT: hazardous push config]
    D -- yes --> E[Fetch origin]
    E --> F[Dispatch command]
```

## `OPTION`

Global Options

| ID       | Flag        | Short | Description                                                               |
|----------|-------------|-------|---------------------------------------------------------------------------|
| `OPTION-01` | `--debug`   | `-d`  | Trace every git command with its elapsed time (`OPTION-11`); remove `--quiet` from git invocations |
| `OPTION-02` | `--bare`    | `-b`  | Machine-readable output: space-separated branch names (any action, `OPTION-08`) |
| `OPTION-03` | `--json`    | `-j`  | Structured JSON output (any action, `OPTION-08`; see [JSON Output](#json)) |
| `OPTION-04` | `--select`  | `-s`  | Interactive branch picker for `--add` / `--remove` (requires TTY)         |
| `OPTION-05` | `--version` | `-V`  | Print the current version string to stdout and exit 0 (see `BUILD-02` for a dev build) |
| `OPTION-06` | `--help`    | `-h`  | Print a usage summary to stdout and exit 0; direct to the documentation site for full details |
| `OPTION-07` | `--yes`     | `-y`  | Bootstrap `fi` without the confirmation prompt (see `MERGE-15`); intended for CI and scripts |
| `OPTION-10` | `--update`  | `-u`  | Update the installed git-fi to the latest published version (see `UPDATE-05`) |
| `OPTION-12` | `--auth[=<action>]` |  | Report which GitLab token is in effect for a host, and store or remove it (see `AUTH-06`) |
| `OPTION-13` | `--host <hostname>` |  | Which GitLab host `--auth` acts on, overriding origin detection (see `AUTH-07`) |

`OPTION-08` `--bare` and `--json` select an output format rather than a command, so git-fi shall accept either with any action. When an action other than `list` completes, git-fi shall render the resulting branch list in the requested format, exactly as `list` would (`LIST-02`, `JSON-01`). git-fi shall keep stdout free of human-readable output in these modes: the merge display and its annotations are suppressed (`TERM-07`) and any diagnostics go to stderr (`JSON-01`).

`OPTION-09` If `--select` is combined with `--bare` or `--json`, then git-fi shall abort with `--select cannot be combined with <flag>`. The picker draws its interactive UI on stdout, which is the stream carrying machine output, so the two cannot both use it.

`OPTION-12` and `OPTION-13` carry no short form. Every other flag has one because it is typed in the course of ordinary work; these two are typed once per machine, and spending two of the remaining single letters on them would price out a flag that gets typed daily. git-fi shall render a long-only flag in the help, man page, completions, and docs tables without inventing a short form for it.

`OPTION-11` Under `--debug`, git-fi shall write each git command to stderr before running it and its elapsed seconds after it returns, including when it fails. Announcing before and timing after is what makes a hang attributable while it is still hanging, rather than only once the command returns. `--debug` applies to every git invocation in the run, not to the call sites that opt in: it describes the run, and a trace that omits the read queries cannot answer where a slow repository spends its time.

## `HELP`

Help & Documentation

`HELP-01` When `help` is given as the sole argument, git-fi shall print the usage summary to stdout and exit 0. (git routes the `--help` flag to `man git-fi`; the bare `help` word and `-h` reach git-fi directly, providing a man-independent path to the summary.)

`HELP-02` git-fi shall ship a man page (`git-fi.1`, declared via the package `man` field) so that `git fi --help` — which git routes to `man git-fi` — displays the manual.

## `COMPLETE`

Shell Completion

`COMPLETE-01` git-fi shall provide shell completion for bash and zsh, discovered by git for the `git fi` subcommand, completing the action/option flags and branch-name arguments.

`COMPLETE-02` git-fi shall provide completion for both providers that dispatch `git fi`: zsh's built-in `_git` (which calls `_git-fi`) and git's own completion wrapper (which calls `_git_fi` under ksh emulation, in bash and in zsh). The `_git_fi` completer shall read the command line from git's `$words`/`$cur` — not bash's `COMP_WORDS`, which git's zsh wrapper leaves unset — so action-aware completion (`COMPLETE-03`) works under both shells. Each file on the zsh fpath shall complete on the first `<TAB>` in a shell: zsh's autoload runs the file as the function body, so a file that only defines its completer leaves that first tab doing nothing.

`COMPLETE-03` At the command position (no action flag yet), git-fi's completion shall offer the action/option flags and subcommands, not a branch list. When completing a branch argument, it shall offer: for `--add`, origin branches not already in fi (excluding `HEAD`, `fi`, and the default branch); for `--remove`, only branches currently in fi.

`COMPLETE-04` git-fi's completion shall determine fi membership without a network fetch (via `GIT_FI_NO_FETCH`, `PRE-05`), so completion stays offline and fast.

`COMPLETE-05` git-fi shall provide an `install-completions [bash|zsh|zsh-git]` subcommand that prints a completion script to stdout — for sourcing (e.g. `source <(git fi install-completions bash)`) or for writing onto the zsh fpath. It shall print one target per invocation: `bash` the git-completion-format script, `zsh` the `_git-fi` file for zsh's built-in `_git`, and `zsh-git` the `_git_fi` file for git's own completion wrapper. With no argument it shall detect `bash` or `zsh` from `$SHELL`; every provider named by `COMPLETE-02` shall be installable through this subcommand, without copying files out of the package directory. If no supported target is given or detected, then git-fi shall abort with usage guidance.

`COMPLETE-06` `install-completions --write <dir>` shall write the zsh completion files into `<dir>`, creating it if absent, and shall name each path written. With no target it shall write both zsh files, so one command covers whichever provider (`COMPLETE-02`) the user's git install dispatches to; with `zsh` or `zsh-git` it shall write that one file, and with `bash` it shall abort — bash completion is sourced from an rc file and has no fpath to land on. It shall report reloading completions as a step for the user to run. git-fi shall not edit the user's rc files or write to any directory the user did not name; when `<dir>` cannot be created or written, it shall abort naming the path and how to install into a directory the user owns.

`COMPLETE-07` Installing git-fi globally shall install the zsh completion files, so `git fi <TAB>` works without a further step. They shall go under npm's own prefix (`<prefix>/share/zsh/site-functions`, the directory Homebrew and `/usr/local` zsh setups carry on their fpath, and the prefix npm already links the man page into); git-fi shall write nothing outside that prefix and shall not edit the user's rc files. A local (non-global) install shall install nothing. A prefix that cannot be resolved or written shall not fail the install: git-fi shall report the `COMPLETE-06` command that finishes the job and exit 0.

## `TERM`

Terminal Output

### General

`TERM-01` When the word `fi` appears in console output (messages, headers, prompts), git-fi shall render it as a code-styled token — e.g., using backtick quoting in markdown-aware terminals, or bold/highlighted formatting in TTY output.

### Color

`TERM-02` The system shall use only the base 8 ANSI foreground colors (and their bold variants). The system shall not use 256-color codes, RGB escape sequences, or background colors — these break across terminal themes. Semantic ANSI colors adapt to the user's theme automatically (e.g., "cyan" in Solarized Dark differs from "cyan" in Dracula, but both are readable).

`TERM-03` The system shall use bold, dim, underline, and other text attributes for structural emphasis so meaning is not conveyed by color alone.

`TERM-04` When stdout is a TTY, git-fi shall colorize output using these assignments:

- **Branch names** — cyan; green when highlighted on success
- **Action annotations** (`<- new`, `<- merging`, etc.) — dim; green bold on success
- **Success verb** (`added`, `removed`, etc.) — green, bold
- **Failure indicator** (`failed`) — red, bold
- **Warnings** (dead branches, already-merged) — yellow
- **Errors** and abort messages — red, bold
- **Bullet markers** (` * `) — dim

`TERM-05` When stdout is not a TTY, `--bare` or `--json` is specified, or the `NO_COLOR` environment variable is set, the system shall disable all color output (see [no-color.org](https://no-color.org)).

### Progress

`TERM-06` While a long-running operation is in progress, git-fi shall display progress on stderr so it does not interfere with stdout:

- **Fetch** — `Fetching from origin...` with a spinner
- **Merge** — `Merging N branches...`
- **GitLab API** — `Fetching CI status...` with a spinner

`TERM-07` When stderr is not a TTY, or when `--bare` or `--json` is specified, git-fi shall suppress progress output.

`TERM-08` When a mutation operation is in progress and stdout is a TTY, git-fi shall print the branch display and update each action annotation (`<- ...`) in-place using cursor movement, progressing through a sequence of states where each state fully replaces the previous annotation text.

**Initial state** — displayed when the branch list is first printed:

| Action   | Initial annotation |
|----------|--------------------|
| add      | `<- new`           |
| remove   | `<- removing`      |
| force    | `<- replacing`     |
| again    | `<- re-merging`    |

**Intermediate states** — each overwrites the annotation in-place as the operation progresses:

1. `<- merging` — before `git merge` (skipped when no branches to merge)
2. `<- committing` — before `git commit`
3. `<- pushing` — before `git push`

**Terminal states** — the final annotation, styled green bold on success or red bold on failure:

| Action   | Success annotation | Failure annotation |
|----------|--------------------|--------------------|
| add      | `<- added`         | `<- failed`        |
| remove   | `<- removed`       | `<- failed`        |
| force    | `<- replaced`      | `<- failed`        |
| again    | `<- re-merged`     | `<- failed`        |

`TERM-09` When stdout is not a TTY, git-fi shall print neither the branch display nor any annotation from `TERM-08`, and on success shall state the outcome once as `<verb> fi`:

| Action | Off-TTY outcome   |
|--------|-------------------|
| add    | `added to fi`     |
| remove | `removed from fi` |
| force  | `replaced fi`     |
| again  | `re-merged fi`    |

In human mode this line goes to stdout, ahead of the branch list, so a reader cannot see the two reordered; under `--bare` or `--json`, stdout is machine-only (`JSON-02`) and it goes to stderr. On failure there is no outcome line: the `MERGE-11` diagnostics carry it.

The display exists to be a canvas for the in-place rewrites, and the branch list it shows is repeated by the table that follows (`LIST-03`). Printed where the rewrites cannot happen, it leaves the *initial* verb (`<- re-merging`, for an operation that finished) as the log's only statement of the outcome.

`TERM-10` Pipeline status is carried by an emoji (`GITLAB-01`, `GITLAB-05`) and by nothing else in the same cell, so under the `TERM-05` conditions that disable color — stdout not a TTY, `--bare`, `--json`, or `NO_COLOR` — git-fi shall print the status as a word instead:

| Status | Emoji | Word |
| --- | --- | --- |
| SUCCESS | ✅ | `success` |
| FAILED | ❌ | `failed` |
| TIMEOUT | ⏰ | `timed out` |
| RUNNING | ⏳ | `running` |
| PENDING | ⏳ | `pending` |
| NO PIPELINE | ➖ | `none` |
| SKIPPED | ⏭️ | `skipped` |

A log read as plain text is the case this covers: a CI job log or a piped run, where the glyph is the sole carrier of a fact the reader needs and `TERM-03` already rules out conveying meaning by decoration alone.

## Commands

Exactly one action flag may be specified. If no action and no branches are given, the default action is `list`.

```mermaid
%%{ init: { 'look': 'handDrawn' } }%%
flowchart TD
    A[Parse flags] --> B{Which action?}
    B -- none --> L[list]
    B -- -a --> ADD[add: append to branch list]
    B -- -r --> REM[remove: subtract from branch list]
    B -- -f --> FRC[force: replace branch list]
    B -- -g --> AGN[again: re-merge, dropping dead and merged branches]
    B -- -A --> ABT[abort: re-pull fi from origin]

    ADD --> M[Merge Process]
    REM --> M
    FRC --> M
    AGN --> M

    L --> OUT[Print branch list]
    ABT --> PULL[Fetch and update origin/fi ref]
```

| Flag | Short | Action |
|------|-------|--------|
| _(none)_ | | List branches currently in fi |
| `--add` | `-a` | Add branch(es) to fi |
| `--remove` | `-r` | Remove branch(es) from fi |
| `--force` | `-f` | Replace fi contents with only the given branch(es) |
| `--again` | `-g` | Re-merge fi, dropping dead and already-merged branches |
| `--abort` | `-A` | Re-pull fi from origin (discard local state) |

### Branch Name Resolution

- `BRANCH-01` When a branch name does not start with `origin/`, git-fi shall prepend `origin/`.
- `BRANCH-02` When `--add` or `--remove` is specified with no branch name and `--select` is not set, git-fi shall default to the current branch. If the current branch is `main`, `master`, `fi`, or `HEAD`, then git-fi shall abort with: `No branch was specified.`
- `BRANCH-03` When `--add` or `--force` is specified, git-fi shall verify all branches exist on origin. If any branches are missing, then git-fi shall print the missing branches and abort:
  ```
  the following branches do not exist on origin:
   * no-such-branch
  ```
- `BRANCH-04` When `--remove` is specified, git-fi shall not perform an existence check (removing a non-existent branch is a no-op).

### list (default)

`LIST-01` If `origin/fi` does not exist, then git-fi shall abort with `there is no fi branch for this project.` followed by a line explaining how to bootstrap it (`git fi --add <branch>`, or `--yes` in CI) and a link to the documentation site.

**Behavior:**

- `LIST-02` When `--bare` is specified, git-fi shall print space-separated branch names (without `origin/` prefix) to stdout.
- `LIST-03` When listing in normal mode, git-fi shall print a tabular list of branch names (without `origin/` prefix). Where a GitLab token resolves (`AUTH-01`), git-fi shall also show CI status, last commit date, and author (see [GitLab CI Status](#gitlab)), followed by the fi integration pipeline ID and status (see GITLAB-05).

**Output (normal):**

```
Branch
──────────────
feature-a
feature-b

For enhanced CI status, run git fi --auth=login. To suppress this hint, export GIT_FI_NO_HINTS.
```

**Output (bare):**

```
feature-a feature-b
```

`LIST-04` git-fi shall print the hint line only when it is addressed to someone who can act on it: it shall suppress the line when a token already resolves (`AUTH-01`), and otherwise under the same conditions that suppress the update notice (`UPDATE-03`) — stdout not a TTY, `$CI` set, `--bare` or `--json`, or `GIT_FI_NO_HINTS` set. In a CI job or a pipe there is no reader to act on it, so the advice becomes a line every build log carries. The hint shall name `git fi --auth=login` rather than the environment variable: it is addressed to a person at a terminal, and that path is the one that asks for a `read_api` token (`AUTH-10`).

`LIST-05` When branch names are given with no action flag, git-fi shall treat them as a single regex pattern that filters the `list` output to matching branches. If more than one pattern is given, then git-fi shall abort.

`LIST-06` git-fi shall display branches in insertion order — the order in which they were originally added. git-fi shall not apply alphabetical or date-based sorting.

`LIST-07` When fi holds no branches, git-fi shall omit the table entirely (no headers or separator are printed) and shall print an italic `(no branches)` in its place. Italic rather than dim, because the `fi:` pipeline line directly below it is dim and two grays read as one line. A zero-row table prints nothing at all, which reads as a command that failed rather than as an fi with nothing in it. The `fi:` pipeline line (GITLAB-05) shall still be shown if applicable. Under the conditions that carry the CI-status hint (`LIST-04`), git-fi shall follow the list with `Add a branch with git fi --add <branch>.`

**Output (empty fi):**

```
(no branches)
fi: #12345 ✅

Add a branch with git fi --add <branch>.
```

### Interactive Branch Selection (`--select`)

`SELECT-01` When `--select` is combined with `--add`, git-fi shall display an interactive multi-select picker showing all remote branches not already in fi (excluding the default branch, `origin/fi`, and the `origin/HEAD` symbolic ref). When the user confirms, git-fi shall continue with the normal add flow.

`SELECT-02` When `--select` is combined with `--remove`, git-fi shall display an interactive multi-select picker showing branches currently in fi. When the user confirms, git-fi shall continue with the normal remove flow.

`SELECT-03` If `--select` is specified and a TTY is not available on both stdin and stdout, then git-fi shall abort.

`SELECT-04` If `--select` is combined with `--force`, `--again`, or `--list`, then git-fi shall abort.

`SELECT-05` When the user confirms the picker with no branches selected, git-fi shall exit 0 without merging.

`SELECT-06` When `--select` is used alone (no `--add` / `--remove`), git-fi shall display a unified multi-select picker showing all remote `--no-merged` branches from the last 3 months (sorted by committer date, most recent first), plus any branches currently in fi. Current fi branches shall be pre-selected (toggled on). When the user confirms, git-fi shall compute the diff between the current fi set and the selected set to determine which branches to add and remove, then continue with the normal merge flow.

### add / `--add` / `-a`

`ADD-01` If the working index is not clean, then git-fi shall abort.

**Process:**

1. `ADD-02` git-fi shall get the current branch list from fi (via commit message parsing — see [Branch List Storage](#storage)).
2. `ADD-03` git-fi shall append new branches and deduplicate.
3. `ADD-04` git-fi shall run the merge process with the full list.

**Output:**

```
fi:
 * feature-a
 * feature-b
 * feature-c  <- added
```

### remove / `--remove` / `-r`

`COMMAND-01` When `--remove` is specified, git-fi shall remove the specified branches from the current fi branch list and run the merge process with the remaining list.

**Output:** Removed branches are shown dimmed with `<- removing` annotation.

`COMMAND-02` When removing a branch that is not in fi, git-fi shall silently ignore it.

### force / `--force` / `-f`

`COMMAND-03` When `--force` is specified, git-fi shall replace the entire branch list with only the specified branches.

**Output:** Branch list followed by `<- replacing` footer.

`COMMAND-04` When `--force` is specified with no branches, git-fi shall remove all features (empty fi).

### again / `--again` / `-g`

`COMMAND-05` When `--again` is specified, git-fi shall re-merge all branches currently in fi onto the current default branch. If branch arguments are provided, then git-fi shall abort with `--again does not accept branch names`.

Re-merging is also what prunes fi: the merge process drops branches that no longer exist on origin (`MERGE-06`) and branches already merged into the default branch (`MERGE-07`) before it merges, so `--again` leaves fi holding only live, unmerged branches. There is no separate prune action.

`--again` always re-merges and force-pushes, including when nothing was dropped and the default branch has not moved. The push is how a stale `fi` catches up with a default branch that has advanced, which is the reason to run the command at all; gating it on "something changed in the branch list" would skip exactly that case.

**Output:** Branch list followed by `<- re-merging` footer.

### abort / `--abort` / `-A`

`COMMAND-06` When `--abort` is specified, git-fi shall re-pull `origin/fi` from origin, discarding any local ref state, then render the resulting branch list (`OPTION-08`). The `Re-pulled fi from origin.` status line goes to stderr. If branch arguments are provided, then git-fi shall abort with `--abort does not accept branch names`.

`COMMAND-07` If `origin/fi` does not exist when `--abort` is specified, then git-fi shall abort with `origin/fi does not exist — nothing to re-pull`.

## Merge Process

The core merge operation that `--add`, `--remove`, `--force`, and `--again` all converge on.

```mermaid
%%{ init: { 'look': 'handDrawn' } }%%
flowchart TD
    A[Start merge] --> B{Ambiguous origin/fi?}
    B -- yes --> B1[ABORT: more than one origin/fi]
    B -- no --> C{Tracked files clean?}
    C -- no --> C1[ABORT: index is dirty]
    C -- yes --> D[Capture untracked files]
    D --> E[Fetch if needed]
    E --> F{origin/fi exists?}
    F -- no --> G{User confirms bootstrap?}
    G -- no --> G1[ABORT]
    G -- yes --> H[Prune dead branches]
    F -- yes --> H
    H --> I[Warn about already-merged branches]
    I --> J[Checkout -B fi from default branch]
    J --> K[git merge --no-commit --no-ff]
    K --> L{Merge succeeded?}
    L -- yes --> M[Commit]
    M --> N[Push -f origin fi]
    N --> O[Print summary]
    L -- no --> P[Print failed branches]
    P --> Q[git reset --hard HEAD]
    Q --> R[List new untracked files]
    R --> S[ABORT: merge failures]
    O --> T[Cleanup]
    S --> T
    T --> U[Checkout original branch]
    U --> V[Delete local fi branch]
```

### Flow

1. `MERGE-01` If more than one `origin/fi` ref exists, then git-fi shall abort with: `There is more than one origin/fi!`
2. `MERGE-02` If uncommitted changes to tracked files exist, staged or unstaged, then git-fi shall abort with `Your index is dirty`. Untracked files shall not block the merge.
3. `MERGE-03` git-fi shall capture a snapshot of untracked files via `git ls-files --other --exclude-standard`.
4. `MERGE-04` git-fi shall run `git fetch --quiet --prune origin` (if not already done).
5. `MERGE-05` If no `origin/fi` ref exists after fetch, then git-fi shall require confirmation before bootstrapping. Unless `--yes` is given (`OPTION-07`, `MERGE-15`), git-fi shall display a bootstrap confirmation prompt; if the user does not enter `y`, then git-fi shall abort. Example:

   ```text
   Bootstrap path/to/repo with fi capability?
   See: https://github.com/gettyimages/git-fi

   y - yes
   anything else: no

   Are you sure?
   ```

   `MERGE-14` git-fi shall include a `See:` line in the bootstrap prompt (MERGE-05) linking to the git-fi project README (`https://github.com/gettyimages/git-fi`) so users unfamiliar with fi can understand the tool before confirming.

   `MERGE-15` Bootstrapping requires explicit confirmation. If `--yes` (`OPTION-07`) is given, git-fi shall bootstrap without prompting. Otherwise the prompt (MERGE-05) requires an interactive terminal: if no `origin/fi` ref exists after fetch and either stdin or stdout is not a TTY, then git-fi shall abort without prompting: `Bootstrapping fi requires confirmation; re-run with --yes or from an interactive terminal.` This keeps an unattended process from creating and force-pushing a new fi branch with no explicit confirmation. Once `origin/fi` exists, every command operates non-interactively.

6. `MERGE-06` When branches in the list no longer exist on origin, git-fi shall remove them and warn on stderr: `Ignoring branches that no longer exist:`
7. `MERGE-07` When a branch is already an ancestor of the default branch, git-fi shall exclude it from the merge and warn on stderr: `X already in main`. Because the branch list is stored in the resulting commit message (see [Branch List Storage](#storage)), excluding the branch also drops it from fi.
8. `MERGE-08` git-fi shall create a temporary fi branch via `git checkout --quiet -B fi origin/<default_branch>`.
9. `MERGE-09` git-fi shall merge via `git merge --no-commit --quiet --no-ff --no-edit <branch1> <branch2> ...`
10. `MERGE-10` When the merge succeeds, git-fi shall:
    - Commit (see [Commit Message](#commit-message)) — update annotation to `<- committing`.
    - Push: `git push --no-verify -f origin fi` — update annotation to `<- pushing`.
    - Finalize annotation line(s) with the action's terminal success state (see TERM-08), or state the outcome once off a TTY (see TERM-09).
    - Print the branch list table (identical to `list` output, including the fi pipeline per GITLAB-05) so the user sees the final state without running a separate command.
11. `MERGE-11` When the merge fails, git-fi shall:
    - Abort the failed merge (leave the working tree clean).
    - Print failed branch names.
    - List any new untracked files created during the failed merge, with suggested `rm` commands.
    - Abort with: `Aborted due to merge failures`
12. `MERGE-12` After the merge process completes (success or failure), git-fi shall:
    - Restore the user to their original branch.
    - Delete the local temporary `fi` branch.

### Commit Message

git-fi supports two commit-message formats for the fi branch: the **preferred** terse format (`STORAGE-01`) and a **legacy** git-merge format (`STORAGE-03`). git-fi reads and round-trips either one (`STORAGE-02`, `STORAGE-03`); which one it *writes* is governed by `STORAGE-04`. In the terse format, `shorthash` is the short hash of the default branch tip.

**CI mode** — see [CI Integration](#ci-integration) for the commit message format when running in a pipeline.

### Success Output

On a TTY, the annotation line(s) update in-place to show the terminal state (see TERM-08), followed by the full branch list table (see LIST-03):

```
fi:
 * feature-a
 * feature-b  <- added
Branch    │ Date       │ Author │ Pipeline
──────────┼────────────┼────────┼──────────
feature-a │ 2026-03-30 │ Alice  │ 11111 ✅
feature-b │ 2026-03-30 │ Bob    │ 22222 ✅
fi: #12345 ⏳
```

Off a TTY — a CI job log, or a piped run — the display and its annotations are gone, the outcome is one line (TERM-09), and status is worded (TERM-10):

```
added to fi
Branch    │ Date       │ Author │ Pipeline
──────────┼────────────┼────────┼──────────
feature-a │ 2026-03-30 │ Alice  │ 11111 success
feature-b │ 2026-03-30 │ Bob    │ 22222 running
fi: #12345 running
```

If no GitLab token resolves (`AUTH-01`), the table has only a Branch column (no CI data). The `fi:` pipeline line (GITLAB-05) is also omitted.

### Failure Output

```
Failed trying to merge branch(es):

 * feature-a
 * feature-b

Aborted due to merge failures
```

If new untracked files were created during the failed merge:

```
Some extra untracked files have been left as a result of the failed merge(s):

 * conflict-file.txt

You can delete these by running:
  rm "conflict-file.txt"
```

## `STORAGE`

Branch List Storage

`STORAGE-01` The **preferred** commit-message format (**terse**) encodes the branch list in the fi branch's commit message as `(branch-a, branch-b)@[shorthash]`. When no branches are present, the format is `@[shorthash]`. Branch names are stored without the `origin/` prefix. (When git-fi writes this format is governed by `STORAGE-04`.)

`STORAGE-02` When reading the branch list, git-fi shall parse the commit message of `origin/fi` using the regex pattern `\(([^)]+)\)@\[` and split on commas. git-fi shall prepend the `origin/` prefix during parsing and filter out the default branch.

### Legacy Commit Message Format

`STORAGE-03` A previous version of the tool used the standard git merge commit message format:

```text
Merge remote-tracking branches 'origin/86b8nre6n_New_endpoint_to_complete_cko_flow_order', 'origin/Try-fix_get_api_orders_for_company' and 'origin/prorated-sub-checkout-successful' into fi
```

When parsing the fi branch's commit message, if this legacy format is detected — a message matching `Merge remote-tracking branch(es) 'origin/<branch>'...into fi` — git-fi shall extract branch names from the quoted `'origin/<name>'` segments. Detection is used only for *reading*; which format git-fi *writes* is defined in `STORAGE-04`.

### Write-Format Selection

`STORAGE-04` During the migration rollout, git-fi shall write the **legacy** format (`STORAGE-03`) for every fi commit — bootstrap, empty, or existing — regardless of the format of the current `fi` commit message. Regardless of the write format, git-fi shall read and round-trip both formats (`STORAGE-02`, `STORAGE-03`). The write format is a single switch (the *default write format*, `DEFAULT_WRITE_FORMAT` in `src/merge.ts`).

> **Rollout note.** git-fi writes `legacy` for now so downstream consumers that parse the fi commit message keep working unchanged. The switch to writing the preferred terse format (`STORAGE-01`) is scheduled for after the rollout window (~2026-09) — a one-line change to the default write format. Reading is unaffected by the switch; both formats are always accepted.

## Default Branch Detection

`BRANCH-05` git-fi shall determine the mainline branch for the repository (typically `main` or `master`) via `git symbolic-ref refs/remotes/origin/HEAD`, extracting the last path component. If the symbolic ref is not set, then git-fi shall fall back to probing `origin/main` and `origin/master`.

## `FORMAT`

Formatting Helpers

- `FORMAT-01` git-fi shall render bullet lists with each item prefixed with ` * `. When the list is empty, git-fi shall render `<Nothing>`.
- `FORMAT-02` git-fi shall update action annotations in-place through initial, intermediate, and terminal states as defined in TERM-08.

## `AUTH`

Authentication

git-fi reads the GitLab API to show pipeline status, which takes a token. Taking that token only from an environment variable rewards the expedient choice: the cheapest way to satisfy a variable is to reuse a token exported for something else, which is typically full `api` scope where git-fi needs only `read_api`. So git-fi asks for a credential of its own, stores it, and says when the token you supplied is broader than the one it needs.

`GITLAB_ACCESS_TOKEN` is the second source, because a CI job's credential arrives as a variable. At a terminal git-fi checks the stored configuration first and falls back to the variable; in a pipeline the variable is the only source git-fi reads. `AUTH-01` is the whole rule.

git-fi stores its own token rather than borrowing another tool's. Shelling out to `glab api` would mean holding no credential, but `glab` is built around one token per forge, and that token is scoped for everything its owner does there. A separate stored credential is what makes a `read_api`-only context possible.

- `AUTH-01` git-fi shall resolve the GitLab token for a host from two sources: the stored configuration (`AUTH-03`) and the `GITLAB_ACCESS_TOKEN` environment variable. Where `$CI` is set, git-fi shall not read the stored configuration at all — the environment variable is the only source there, and a pipeline with none set has no token. Otherwise git-fi shall check the stored configuration for the host first and fall back to the environment variable, so a host with nothing stored resolves the exported one. The principle is to prefer the deliberate credential over the ambient one: at a terminal the stored token is the deliberate one, and in a pipeline the credential is the job's. Declining to *read* the file in CI, rather than ranking it second, is what makes a config file a container image happens to carry structurally incapable of supplying a pipeline's token. An environment variable set to the empty string shall be treated as absent, and shall not shadow a stored token.
- `AUTH-02` git-fi shall resolve the token at most once per invocation, memoizing the result, so every consumer of the GitLab API within a run uses the same token and the same source.
- `AUTH-03` The stored configuration shall live at `$XDG_CONFIG_HOME/git-fi/config.json`, falling back to `~/.config/git-fi/config.json`. It shall carry a `schemaVersion` field and a `hosts` object keyed by GitLab hostname, each entry recording the token, the scopes and expiry reported at login (`AUTH-08`), and the time it was stored:

  ```json
  {
    "schemaVersion": 1,
    "hosts": {
      "gitlab.example.com": {
        "token": "glpat-xxxxxxxxxxxxxxxxxxxx",
        "scopes": ["read_api"],
        "expiresAt": "2027-01-01",
        "storedAt": "2026-08-08T19:42:25.241Z"
      }
    }
  }
  ```

  Keying by host is what lets one machine hold a token for a self-hosted instance and another for `gitlab.com` without either being sent to the wrong host: a repository whose origin is a host with no stored entry falls through to `GITLAB_ACCESS_TOKEN` rather than reusing a neighbour's credential.
- `AUTH-04` git-fi shall create the configuration directory with mode `0700` and the file with mode `0600`, and shall refuse to read the file when its mode grants any group or world permission, aborting with the offending mode and the `chmod` that corrects it. A `0600` file is only an improvement over an exported variable because fewer processes can read it, so this check is what the storage rests on rather than a nicety. Where the platform has no POSIX file modes (Windows), git-fi shall store the file without setting or checking the mode.
- `AUTH-05` git-fi shall carry the token action as the value of an `--auth` flag rather than as a subcommand. A lone positional argument to `git fi` is a list filter (`LIST-05`), so an `auth` subcommand would reserve that word and stop `git fi auth` from filtering for auth-related branches. `install-completions` and `help` (`HELP-01`, `COMPLETE-05`) get away with being words because nobody filters on those.
- `AUTH-06` `--auth` shall report status (`AUTH-11`), `--auth=login` shall prompt for and store a token (`AUTH-08`), and `--auth=logout` shall remove the stored token for the host. `--auth=status` shall be accepted as the explicit spelling of the bare form. Any other value shall abort naming the three accepted actions. `--auth` shall collide with the actions in `COMMAND-*` the way they collide with each other, and shall reject branch-name arguments.
- `AUTH-07` git-fi shall determine the host for `--auth` from the origin remote (`GITLAB-02`), and `--host <hostname>` shall override that. Because the override supplies the host directly, `--auth --host <hostname>` shall work outside a git repository, so a token can be stored once from anywhere. Where neither source yields a host, git-fi shall abort saying no GitLab origin was detected and naming `--host`. `--host` shall be rejected with any action other than `--auth`.
- `AUTH-08` `--auth=login` shall read the token from stdin only, never from an argument value: argv is visible to `ps` and a token typed on the command line lands in shell history. At a TTY git-fi shall prompt with terminal echo disabled; off a TTY it shall read piped stdin, so `... | git fi --auth=login` works from a password manager.
- `AUTH-09` Before storing, `--auth=login` shall validate the token against `GET /api/v4/personal_access_tokens/self` on the target host, and shall not store a token the API rejects. When the reported scopes include anything beyond `read_api`, git-fi shall store the token and warn that it is broader than git-fi needs, naming the scopes it carries. Telling you at the moment you supply it is what addresses the incentive to reuse a broad token; documentation the reader may never open does not.
- `AUTH-10` The `--auth=login` prompt shall link the prefilled token form for the target host, `https://<host>/-/user_settings/personal_access_tokens?name=git-fi&scopes=read_api`, which GitLab populates from those query parameters. The narrow token is then the low-effort path rather than the one that costs an extra decision.
- `AUTH-11` `--auth` answers which credential is in effect, which nothing else in the tool reveals: with two possible sources and a token that can expire or be over-scoped, the failure modes are all silent ones. It shall print the host, which source the live token came from, the scopes and expiry recorded at login, and the last 4 characters of the token — enough to tell two tokens apart — and shall never print the token itself. Where a stored token is taking precedence over a set `GITLAB_ACCESS_TOKEN` (`AUTH-01`), it shall say the export is being shadowed, since an export that is not taking effect is otherwise invisible. Where no token resolves, it shall say so and name `--auth=login`. Status shall issue no network request: it reports what login recorded, so it answers offline and stays fast. A token sourced from the environment has no recorded scopes or expiry, and status shall say that rather than implying none exist.
- `AUTH-12` Shell completion (`COMPLETE-01`) shall offer `login`, `status`, and `logout` as the values of `--auth`.
- `AUTH-13` Where the GitLab API rejects the token with HTTP 401, git-fi shall report the credential rather than the request: the host, which source supplied the token (`AUTH-01`), and the prefilled token form (`AUTH-10`) that issues a replacement. It shall name `--auth=login` as the way to store the new token, adding for an environment-sourced token that a stored one takes precedence over the export. The branch the failing request happened to name shall not appear, since a rejected credential is not about any one branch, and GitLab's response body shall not be printed: for 401 it restates the status in JSON, whereas for other statuses it carries the only detail git-fi has. The way back to basic mode (`GITLAB-03`) shall remain offered, but as the alternative to fixing the token rather than the only way out.

## `GITLAB`

GitLab CI Status

`GITLAB-01` When a GitLab token resolves for the origin's host (`AUTH-01`), git-fi shall fetch pipeline status for each branch from the GitLab API and display a table with columns: Branch, Date, Author, Pipeline. git-fi shall show status with emoji indicators:

| Emoji | Status |
| --- | --- |
| ✅ | SUCCESS |
| ❌ | FAILED |
| ⏰ | TIMEOUT |
| ⏳ | RUNNING / PENDING |
| ➖ | MISSING |
| ⏭️ | SKIPPED |

Where the emoji will not be drawn as a glyph, the word is shown instead (`TERM-10`).

`GITLAB-02` git-fi shall parse the origin URL to extract the GitLab project path. git-fi shall support both SSH (`git@gitlab.example.com:path/to/repo`) and HTTPS (`https://gitlab.example.com/path/to/repo`) formats, with optional `.git` suffix removed.

`GITLAB-03` If a GitLab API call fails with a non-404 HTTP error, then git-fi shall abort with a clear error message explaining what failed and naming the way back to basic mode for the source the token came from (`AUTH-01`) — `git fi --auth=logout` for a stored token, unsetting `GITLAB_ACCESS_TOKEN` for an exported one. When the API returns HTTP 404 for an individual branch (e.g. a deleted branch), git-fi shall treat it as `missing` status rather than a fatal error.

`GITLAB-04` When a GitLab project is detected, git-fi shall render branch names and pipeline IDs as clickable terminal hyperlinks (OSC 8). A branch shall link to its comparison against the default branch (`/-/compare/<default>...<branch>`) rather than its file tree — a reader scanning fi is asking what a branch adds, which the compare view answers and a tree listing does not. Hyperlinks are deliberately not tied to the color conditions in `TERM-05`: `NO_COLOR` asks for no color, not for no links, so a plain terminal keeps clickable references.

`GITLAB-09` Where an OSC 8 sequence would not be rendered — stdout not a TTY, or `--bare` / `--json` — an unrendered sequence drops the address entirely, so git-fi shall write the branch compare reference out as a markdown link, `[<branch>](<url>)`. Markdown rather than plain text because of where a line from a build log goes next: pasted into Slack, an issue, or an MR comment, it arrives as a working link. Pipeline IDs shall stay bare there: the branch comparison is what a reader leaves a build log to open, and carrying both URLs inline pushes the table past 200 columns, where the wrap costs more than the second link is worth.

`GITLAB-05` **Pipeline link after merge:** When a GitLab token resolves (`AUTH-01`) and a merge operation succeeds, git-fi shall fetch the pipeline for the `fi` branch matching the just-pushed SHA and display it as `fi: #<id> <status>`, where `#<id>` is a clickable hyperlink (OSC 8) and the status indicator uses the same set as GITLAB-01, worded off a TTY per `TERM-10`. The `fi:` prefix distinguishes this integration pipeline from the per-branch pipelines shown in the list table. GitLab registers the pipeline for a push asynchronously, so if no matching pipeline is found yet, git-fi shall retry with escalating delays of 500 ms, 1 s, and 2 s, returning as soon as one appears so the common case pays only the shortest wait. If the API call fails or no matching pipeline appears, the line is silently omitted.

`GITLAB-06` When the GitLab commits API returns HTTP 404 for a branch in the CI table, git-fi shall display a warning indicator next to the branch name to signal the branch no longer exists on the remote.

`GITLAB-07` git-fi shall issue the per-branch API lookups (`GITLAB-01`) concurrently, capping in-flight requests at 8 so a large branch list does not trip GitLab's rate limiter. Rows shall be presented in the order the branches were given, independent of the order responses arrive. When more than one branch returns a hard HTTP error, the abort (`GITLAB-03`) shall name the first failing branch in that same order, so the message does not vary run to run.

`GITLAB-08` git-fi shall issue GitLab API requests through the Node runtime's built-in HTTP client, with a 10 s timeout per request. git-fi shall not shell out to `curl`, so no external HTTP client is required at runtime and connections are reused across requests.

## CI Integration

`MERGE-13` When git-fi runs inside a GitLab CI pipeline (detected via the `CI` environment variable), git-fi shall include pipeline context in the commit message for traceability:

```text
Re-merge fi branch triggered by build <CI_PIPELINE_ID> due to commit on <CI_COMMIT_REF_NAME>. Was originally: --- <previous_fi_commit_message>

(branch-a, branch-b)@[shorthash]
```

The trailing signature line — written in the current write format (`STORAGE-04`; the example above shows the preferred terse format) — ensures round-tripping works (`STORAGE-02`, `STORAGE-03`) even when the previous commit message is embedded in the `Was originally:` preamble.

| Variable             | Purpose                                                        |
|----------------------|----------------------------------------------------------------|
| `CI`                 | When set, enables CI-aware commit messages                     |
| `CI_PIPELINE_ID`     | Pipeline number included in commit message                     |
| `CI_COMMIT_REF_NAME` | Branch that triggered the pipeline, included in commit message |

These are standard [GitLab predefined variables](https://docs.gitlab.com/ci/variables/predefined_variables/) and do not need to be configured manually.

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `GITLAB_ACCESS_TOKEN` | A GitLab token, enabling CI status display in `list`. Checked after a stored token for the host, and under `$CI` it is the only source git-fi reads (`AUTH-01`); an empty value is treated as absent. |
| `XDG_CONFIG_HOME` | Base directory for the stored token (`AUTH-03`); defaults to `~/.config` |
| `GIT_FI_NO_HINTS` | When set, suppresses the CI-status hint (`LIST-04`) and the update notice (`UPDATE-03`). Both are already suppressed off a TTY and under `$CI`, so this is for opting out at an interactive terminal. |
| `GIT_FI_NO_FETCH` | When set, skips the fetch on read-only operations (`list`) and operates on already-fetched remote-tracking refs (`PRE-05`); set by shell completion to stay offline. Mutating operations always fetch. |
| `NO_UPDATE_NOTIFIER` | When set, suppresses the update notice (`UPDATE-03`) |
| `NO_COLOR` | When set, disables all color output ([no-color.org](https://no-color.org)) |
| `XDG_CACHE_HOME` | Base directory for the update-check cache (`UPDATE-04`); defaults to `~/.cache` |

## `JSON`

JSON Output

`JSON-01` When `--json` is specified, git-fi shall write a single JSON object to stdout. git-fi shall direct all human-readable output (progress, hints, warnings) to stderr only.

The `command` field names the action that ran — `list`, `add`, `remove`, `force`, `again`, or `abort` — so a caller can tell what produced the branch list:

```json
{
  "command": "list",
  "branches": ["feature-a", "feature-b"],
  "ci": [
    {"branch": "feature-a", "status": "success", "author": "Name", "date": "2026-03-13"},
    {"branch": "feature-b", "status": "failed", "author": "Name", "date": "2026-03-12"}
  ]
}
```

`JSON-02` Where a GitLab token resolves (`AUTH-01`), git-fi shall include a `ci` array in the JSON output. When no token resolves, git-fi shall omit the `ci` array.

## `EXIT`

Exit Codes

- `EXIT-01` When an operation completes successfully, git-fi shall exit with code `0`.
- `EXIT-02` When an operation fails, git-fi shall exit with a non-zero code.

## `PERF`

Performance

Every git query and API call costs a process spawn or a network round trip, and both scale with the number of branches in fi. These requirements keep that cost flat rather than linear, so a large fi stays as responsive as a small one.

- `PERF-01` git-fi shall not issue a per-branch git invocation for a question one invocation can answer for every branch at once. Branch existence shall come from a single `git for-each-ref refs/remotes`; already-merged status from a single `git branch -r --merged origin/<default>` (in place of a `git merge-base --is-ancestor` per branch); and branch commit dates from the `%(committerdate:short)` field of the `git branch -r` listing that already enumerates them (in place of a `git log -1` per branch).
- `PERF-02` git-fi shall resolve the default branch (`BRANCH-05`) and the GitLab project (`GITLAB-02`) at most once per invocation, memoizing the result. Both are derived from refs and remotes that the fetch (`PRE-04`) has already settled before any command reads them.
- `PERF-03` git-fi shall issue GitLab API calls concurrently under the bound in `GITLAB-07`, never serially per branch.

## `PLATFORM`

Platform Compatibility

- `PLATFORM-01` git-fi shall suppress stderr from git commands. When `--debug` is set or `show_errors` is explicitly requested, git-fi shall allow stderr output.

## `BUILD`

Build Provenance

A developer can put an unpublished checkout on PATH under the same `git fi` name the published install uses. These requirements keep the two tellable apart, so a bug report names the build it came from.

- `BUILD-01` git-fi shall treat itself as a dev build when a `.git` entry exists at its own package root. A published tarball carries none — npm's `files` list ships `dist`, `man`, `completions`, and the postinstall script — so the marker separates a linked checkout from an installed copy. It shall be read at the package root rather than the working directory, which is a git repository on every ordinary run.
- `BUILD-02` On a dev build, `--version` (`OPTION-05`) shall report the released version followed by `-dev.g<short-sha>`, naming the commit the build came from, and shall append `.dirty` when the checkout's tree differs from that commit. The `g` prefix is what keeps the identifier valid semver: a sha of all digits would otherwise read as a numeric identifier, which may not carry leading zeros. When no commit can be read, git-fi shall report `-dev` alone rather than dropping the marker.

## `INSTALL`

Install Integrity

`git fi` runs whichever `git-fi` comes first on `PATH`, so an installation can be complete and still never run. The state is silent from both ends: npm reports success, and the copy that would notice is the one not being reached.

- `INSTALL-01` Where the `git-fi` that `PATH` resolves first is not the copy executing, `--version` shall report it on stderr: the launcher `git fi` reaches, the copy answering, and how to resolve the two (delete the launcher, or move npm's prefix earlier on `PATH`). Reaching the running copy some other way — `npx`, an absolute path — is the state in which the report can be made at all, and asking which git-fi is installed is the moment it answers a question already being asked. It shall not print on any other command: a second installation is not itself a fault, and a line on every run would be noise to whoever has a reason for it. stdout shall carry only the version string, so anything parsing it is unaffected. `GIT_FI_NO_HINTS` shall suppress it; the update notice's other suppressions (`UPDATE-03`) shall not, since a pipeline reporting which binary it ran is the case this exists for. An unreadable `PATH` entry, an unresolvable entry point, or no `git-fi` on `PATH` at all shall leave the command silent rather than failing it.

## `UPDATE`

Update Notification

git-fi notifies the user when a newer version has been published to npm, without ever blocking or delaying a command.

- `UPDATE-01` When a newer published version than the running one is known from the cache, git-fi shall print a one-line update notice to stderr as it exits — regardless of exit code, and even when a pre-flight check aborts the command — naming the current and latest versions and the `git fi --update` command that performs the update (`UPDATE-05`). The check runs before the pre-flight checks so a wrong-directory or other early abort still surfaces it.
- `UPDATE-02` git-fi shall refresh the cached latest version in a detached background process, throttled to at most once per 24 hours via the cache's `checkedAt` timestamp. The check shall be best-effort: a registry error, timeout, or spawn failure leaves the cache untouched and never surfaces or delays the command.
- `UPDATE-03` git-fi shall suppress both the notice and the background check when stdout is not a TTY, when `$CI` is set, when `--json` or `--bare` is used, when `$GIT_FI_NO_HINTS` or `$NO_UPDATE_NOTIFIER` is set, or when the running build is a dev build (`BUILD-01`). The notice names `git fi --update`, which installs the published global over the linked checkout and takes the trial down with it.
- `UPDATE-04` The cache shall live at `$XDG_CACHE_HOME/git-fi/update-check.json`, falling back to `~/.cache/git-fi/update-check.json`.
- `UPDATE-05` `--update` (`-u`) shall update the installed git-fi by running `npm install -g <package>@latest` with npm's stdio inherited, exiting with npm's exit code and adding no output of its own. Where the platform resolves npm through a `.cmd` shim (Windows), git-fi shall spawn it through the shell, which is the only path left: node finds nothing under the bare name and refuses a direct `.cmd` with `EINVAL`. A consequence is that a missing npm is then the shell's error to report rather than git-fi's, so the `Could not run npm` message is a POSIX-only guarantee. It shall run before the update notice and the pre-flight checks, so it works from any directory. It shall consult neither the cache nor the registry first: the throttle in `UPDATE-02` serves the passive notice, whereas `--update` is an explicit request to install now, and a redundant reinstall is a better answer than refusing one. It shall collide with the actions in `COMMAND-*` the way they collide with each other, and shall reject branch-name arguments.
