# AGENTS.md

git-fi is a git subcommand (`git fi`), written in TypeScript for Node >= 22, that maintains a throwaway integration branch named `fi` holding a merge of in-flight feature branches. The user-facing docs are a Docsify site in `docs/`; `README.md` covers working on git-fi itself, including which version floors move together.

## Commands

```bash
npm install                 # dev dependencies (tsx, typescript)
npm start -- --help         # run src/ directly via tsx
npm run build               # tsc to dist/, then regenerate man/, completions/, docs tables
npm test                    # tsc, verify:generated, then the whole suite
npm run verify:generated    # fail if a committed generated file is stale
npm run trial:on            # link this checkout as `git fi` on PATH (trial:off reverts)
npm run docs                # serve the Docsify site at http://127.0.0.1:3000/
```

`just` lists the same tasks under shorter names; most recipes delegate to an npm script, so `package.json` is where a command is defined.

Run one test file, or filter by name:

```bash
node --import tsx --test test/parse.test.ts
node --import tsx --test --test-name-pattern='<name>' test/cli.test.ts
```

Most suites drive the compiled binary (`dist/index.js`, see `test/helpers.ts`) against throwaway repos (a bare `origin` plus a working clone), so run `npx tsc` first when a change touches `src/`. There is no linter; `tsc` and `verify:generated` are the static checks.

## Spec-driven

`SPEC.md` is the source of truth for behavior. Every requirement has an ID (`MERGE-07`, `READY-04`, `AUTH-01`), and code comments, tests, commit messages, and the README cite those IDs. `STATUS.md` maps each ID to the file and enclosing symbol that implements it. A behavior change updates the SPEC requirement, the code, and the STATUS row together. `docs/spec.md` is a Docsify include of SPEC.md (copied in at deploy by `.github/workflows/pages.yml`), so edit `SPEC.md` only.

## Architecture

- `src/index.ts` parses argv and dispatches to `cmd*` functions in `src/commands.ts`.
- Every mutating action (`--add`, `--remove`, `--force`, `--again`) only computes a new branch list, then converges on `mergeProcess` in `src/merge.ts`. `--abort` re-pulls `origin/fi` without merging.
- fi has no state of its own: the branch list lives in the `fi` commit's message as `(branch-a, branch-b)@[shorthash]` (`STORAGE-*`, parsed in `src/git.ts`). A legacy merge-message format is still read.
- The merge is built in the object database with `git merge-tree --write-tree` and `git commit-tree`, never a checkout, then the sha is force-pushed to `refs/heads/fi`. `src/readiness.ts` does the incremental merge and conflict attribution (which branch conflicts with `main` vs. with a peer) and renders the failure report.
- All git calls go through `git()` / `gitLines()` in `src/git.ts`, which also implements `--debug` timing.
- `src/gitlab.ts` reads per-branch pipeline status; `src/auth.ts` stores the token (`--auth`). Under `CI` only `GITLAB_ACCESS_TOKEN` is read.
- `src/style.ts` and `src/ui.ts` handle TTY vs. plain output: animated display on a terminal, a one-line outcome and worded statuses off one. Under `--bare`/`--json`, stdout carries only machine output and everything else goes to stderr.

## Generated files

`src/help.ts` is the single source of truth for flags. `scripts/gen-docs.ts` generates `man/git-fi.1`, `completions/*`, and the marked `<!-- BEGIN GENERATED -->` tables in `docs/commands.md`. Completion logic lives in `scripts/completion/*.tmpl`. Edit those sources and run `npm run build`; never hand-edit the outputs.

## Releases

Publishing a GitHub Release tagged `vX.Y.Z` runs `.github/workflows/release.yml`, which writes the version into `package.json`, prepends the release body to `CHANGELOG.md`, publishes to npm, and pushes a `Release vX.Y.Z` commit to `main`. The version and changelog are the workflow's to write.
