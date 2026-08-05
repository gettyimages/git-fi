# Changelog

Release notes for git-fi. Each entry is written from the body of the matching
GitHub Release by the release workflow (`.github/workflows/release.yml`).

<!-- releases below -->

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
