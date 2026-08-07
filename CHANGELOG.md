# Changelog

Release notes for git-fi. Each entry is written from the body of the matching
GitHub Release by the release workflow (`.github/workflows/release.yml`).

<!-- releases below -->

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
