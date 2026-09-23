# Changelog

Release notes for git-fi. Each entry is written from the body of the matching
GitHub Release by the release workflow (`.github/workflows/release.yml`).

<!-- releases below -->

## v1.3.2 (2026-09-23)

### Fixes

- A conflict with a branch you're adding no longer drafts a message to anyone. You get the conflicting paths, the other branch and its author, and the fix to make yourself. This also applies to a branch that `--force` brings in.
- When adding branches fails, the output ends with the command to run again once they merge. It names every branch you were adding, since a failed merge adds none of them.


## v1.3.1 (2026-09-23)

### Features

- A failed merge drafts a message for each failing branch's author, ready to paste into chat. It names the branch, the project, the first conflicting hunk (with the merge base between the two sides), and how to fix it. When the failing branch is yours, you get a heads-up to send the other branch's author instead.
- Failures that collide with the same branch are listed first and together, so one conversation with that branch's author clears all of them.
- `--json` on a failed merge gives each conflict an `author` (`name` and `email`), so a CI job can notify them. It's `null` when the branch's latest commit has an empty author email.


## v1.3.0 (2026-09-22)

### Breaking

- **`--json` output is restructured.** Everything about a branch is nested under it, so `branches` is an array of objects rather than names, and the separate top-level `ci` array is gone.

  ```json
  // before
  { "branches": ["feature-auth"], "ci": [ { "branch": "feature-auth", "status": "success" } ] }

  // now
  { "branches": [ { "name": "feature-auth", "ahead": 5, "behind": 0, "merged": false,
                    "ci": { "status": "success", "pipelineId": "11111" } } ] }
  ```

  A consumer reading `.branches[]` as strings, or joining `.ci[]` by name, needs updating. `ci` is `null` where no GitLab token is configured.

- **git 2.41.0 or newer is required**, up from 2.13.0, for the `%(ahead-behind:)` the branch listing reads. Installing on older git now fails during postinstall rather than at the first command. Upgrade git, or install `1.2.2` to stay on the previous floor.

### Features

- A failed merge names which branch actually conflicts, what it conflicts with, and the rebase that clears it, instead of printing the whole set it tried. The usual response to a failure stops being `git fi -f <my-branch>`, which discards everyone else's integration and leaves the conflict for the next person.
- The branch list marks how far each branch trails `main` (`↓12`) and strikes through branches that have already landed, so you can see which one to rebase before `fi` starts failing.
- Merges run entirely in the object database. `git fi` no longer refuses on a dirty index, never checks out a temporary branch, and leaves nothing to clean up if a push is rejected or you interrupt it.
- A rename on one branch against an edit to the same file on another merges cleanly.
- `fi` commits are signed where `commit.gpgsign` is set, so a forge that requires signatures accepts the push.
- `--version` names another `git-fi` ahead of it on `PATH`, which is what a stale launcher from the Ruby gem leaves behind.
- An expired token now comes back with the link that mints a new one and the source the rejected token came from.
- `--json` on a failed merge reports the attribution as a `conflicts` array, so a CI job can act on it without parsing the log.

### Fixes

- `--json` piped to another program is no longer truncated at 64 KiB partway through a string.
- `--debug` shows git's stderr, which it had been collecting and discarding.
- Conflicted paths print the way git prints them, so a filename holding a newline or an escape sequence can't split the report or repaint the terminal.
- A branch whose tip author has a unit separator in their email stays in the listing instead of disappearing from it.
- A local branch named `origin/<something>` no longer wins over the remote ref, which had put unpushed work into the shared branch.
- Listing branches works in a repository whose default branch was renamed or pruned.
- A merge-tree probe that fails to run is no longer read as a branch that doesn't conflict.
- `just trial:off` reinstalls the version the trial replaced rather than whatever npm now calls latest.
- `git fi -g` on an empty `fi` no longer closes with advice to add a branch, when an empty `fi` is what the rebuild was asked for.


## v1.2.2 (2026-09-04)

## What's Changed
* Let untracked files through the dirty check by @chris-peterson in https://github.com/gettyimages/git-fi/pull/14


**Full Changelog**: https://github.com/gettyimages/git-fi/compare/v1.2.1...v1.2.2

## v1.2.1 (2026-08-10)

### Fixes

- `git fi` says `(no branches)` when `fi` holds nothing. It previously printed no
  branch output at all in that case, so the run came back carrying only the `fi:`
  pipeline line and read as a command that had failed. At a terminal it also
  follows the list with how to add a branch. `--bare` and `--json` are unchanged:
  the marker is human output and stays out of both.

### Other

- The quickstart carries a callout for migrating off the Ruby gem, which shipped
  through 0.9.3400163. `git fi` runs whichever `git-fi` comes first on your
  `PATH`, so the gem has to go before the npm package goes on; opening a new
  shell afterward is the step that gets missed, and skipping it leaves `git fi`
  reporting an error from a gem that is no longer installed.
- The README and the quickstart said Node 18 was enough. `package.json` has
  required Node 22 since v1.2.0, so anyone following the docs onto Node 18 would
  have hit an engine mismatch at install time.


## v1.2.0 (2026-08-09)

### Requires Node 22 or newer

git-fi declares `"node": ">=22"`. Node 18 and 20 are both past end of life, and
nothing tested git-fi on them. On an older Node, npm reports an engine mismatch
on install — upgrade Node, or stay on v1.1.0.

### Features

- GitLab tokens are stored per machine instead of exported. `git fi --auth=login`
  prints a link to GitLab's token form with the name and `read_api` scope
  prefilled, reads the token from stdin (never from an argument, which `ps` can
  see and your shell writes to history), checks it against GitLab, and writes it
  to `$XDG_CONFIG_HOME/git-fi/config.json` with the directory `0700` and the file
  `0600`. git-fi refuses to read that file if it later becomes readable by anyone
  else. Pipeline status only needs `read_api`, so that is all the prompt asks
  for; a broader token is stored with a note of the extra scopes it carries.
- Tokens are kept per host, so a self-hosted instance and `gitlab.com` can each
  have their own, and a repo on a host you have never logged into won't be sent a
  neighbour's token. To store one from outside a repository, name the host:
  `git fi --auth=login --host gitlab.com`.
- `git fi --auth` reports which token is in effect, and says so explicitly when a
  stored token is shadowing an export. `git fi --auth=logout` removes it.
- An exported `GITLAB_ACCESS_TOKEN` keeps working, so nothing has to migrate. At
  a terminal git-fi prefers the stored token; in a CI job the credential belongs
  to the job, so git-fi reads the variable only and does not consult the config
  file there at all. Give CI runners the variable as before.
- Login reads stdin, so a password manager can supply the value:
  `pass show gitlab/git-fi | git fi --auth=login`.

### Fixes

- `git fi --update` works on Windows. It failed there before it ever reached npm.
  One consequence of the fix: with the shell doing the executable lookup, a
  missing npm is the shell's error to report and the shell's exit code to return,
  so git-fi's own `Could not run npm` message is a guarantee on POSIX only.

### Other

- CI runs the test suite on Windows as well as Linux, across Node 22, 24, and 26.
  Windows is in the matrix because git-fi takes a different path where the
  platform has no POSIX file modes: it stores the token without setting or
  checking `0600`.
- The test runner is handed explicit paths rather than a shell glob, so a pattern
  that stops matching fails loudly instead of reporting a green suite that ran
  nothing.


## v1.1.0 (2026-08-07)

## v1.1.0

### Features

- `git fi --update` (`-u`) installs the latest published git-fi for you, from any directory. The update notice names this command now, so you no longer have to remember that `npm install -g @gettyimages/git-fi` — not `npm update -g` — is what replaces an already-installed global.
- `--debug` traces every git command with the seconds it took, so a slow repository can be diagnosed rather than guessed at. It also now covers every git call in the run; previously it reached about half of them and stayed silent through the read queries.
- Branch names link to a comparison against the default branch instead of the branch's file tree, so following one shows what the branch adds to `fi` rather than a file listing you'd have to diff yourself.
- Branch links survive a job log. Terminal hyperlinks are an escape sequence a log can't render, which silently dropped the address along with it; where that happens the branch is now written out as a markdown link, so copying a row into Slack, an issue, or an MR comment carries a working link.
- `NO_COLOR` no longer disables terminal hyperlinks. It asks for no color and says nothing about links, so a plain terminal keeps clickable branch and pipeline references.

### Fixes

- The fetch no longer asks for tags. git-fi reads branches and never a tag, and on one service repository this took `git fi` from roughly 30 seconds to under 2. How much it saves depends on the server — a comparable project on the same host was already fast either way — so measure yours with `--debug` rather than assuming. One consequence: `git fi` no longer refreshes tags as a side effect, which is `git fetch`'s job.
- `Fetching from origin...` is now actually displayed while the fetch runs. It never appeared at all before: the message was drawn from a timer that a blocking git call prevented from ever firing, so a slow fetch showed nothing until it finished. On a slow repository that was the entire wait, unlabelled.
- The `GITLAB_ACCESS_TOKEN` hint no longer prints in CI or when output is piped. It asks the reader to export a variable, so it only makes sense at an interactive terminal — in a build log it was a line every job carried with nobody there to act on it. CI runners need nothing configured; `GIT_FI_NO_HINTS` remains for opting out at a terminal.

### Other

- Requirement IDs in `SPEC.md` and the coverage ledger use prefixes that say what they are — `PRE`, `LIST`, `COMPLETE`, `MERGE` and the rest, in place of `PF`, `LS`, `CMP`, `MG`. Requirement text is unchanged; this only affects contributors reading the spec.
- A `justfile` wraps the npm scripts for local work (`just test`, `just run --help`). The recipes delegate to `package.json` rather than restating the commands, and npm remains the supported path.


## v1.0.10 (2026-08-05)

## What's Changed
* Say the outcome once where the annotations cannot animate by @chris-peterson in https://github.com/gettyimages/git-fi/pull/7


**Full Changelog**: https://github.com/gettyimages/git-fi/compare/v1.0.9...v1.0.10

## v1.0.9 (2026-07-31)

## v1.0.9

### Fixes

- `git fi` runs on git 2.13 and newer. The previous floor of 2.39 turned away installs that already had everything git-fi uses, including the git that ships with long-term-support Linux distributions and with older Xcode command line tools.

### Other

- `SPEC.md` records what sets the git floor, so a future change to it starts from the requirement rather than a guess: it tracks the newest git feature the code calls, today `git branch -r --format=`.
- The requirement coverage ledger points at files and symbols instead of line ranges, so following an entry lands on the code it names.


## v1.0.8 (2026-07-28)

**Full Changelog**: https://github.com/gettyimages/git-fi/compare/v1.0.7...v1.0.8

## v1.0.7 (2026-07-28)

## What's Changed
* Fix completion git wrapper by @chris-peterson in https://github.com/gettyimages/git-fi/pull/5


**Full Changelog**: https://github.com/gettyimages/git-fi/compare/v1.0.6...v1.0.7

## v1.0.6 (2026-07-27)

**Full Changelog**: https://github.com/gettyimages/git-fi/compare/v1.0.5...v1.0.6

## v1.0.5 (2026-07-23)

## What's Changed
* build(deps): bump esbuild and tsx by @dependabot[bot] in https://github.com/gettyimages/git-fi/pull/2

## New Contributors
* @dependabot[bot] made their first contribution in https://github.com/gettyimages/git-fi/pull/2

**Full Changelog**: https://github.com/gettyimages/git-fi/compare/v1.0.4...v1.0.5
