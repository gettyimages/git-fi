#!/usr/bin/env node
// Two jobs with opposite failure policies.
//
// First, the git floor (PRE-06): a hard failure, because npm reads a non-zero
// postinstall as a failed install, so the package never lands. Refusing here is
// what turns "you updated and every command now aborts" into "the update
// declined to land, and told you why".
//
// Second, the zsh completion files (COMPLETE-07), so tab completion works out of
// the box instead of being a step the user has to find. That half stays soft: a
// prefix we cannot write to (a root-owned /usr/local, a distro package) prints
// the one command that finishes the job and exits 0.
//
// The destination is npm's own global prefix — <prefix>/share/zsh/site-functions
// — which is the directory Homebrew and /usr/local zsh setups already have on
// their fpath, and the same prefix npm links the man page into. Nothing outside
// the prefix is touched: no rc files, no dotfiles, no guessing at the user's
// fpath.
//
// Plain .mjs rather than part of the TypeScript build: npm runs postinstall
// before prepare, so on a fresh clone dist/ does not exist yet and a compiled
// entry point would fail the install.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The floor is package.json's `engines.git`, which preflightChecks in
// src/git.ts reads too — npm records the field but enforces only `node`, so
// both of git-fi's entry points do the enforcing. Read from package.json rather
// than imported from the compiled source because this file runs before the
// build. A test pins the range's shape and the comparison below.
const MIN_GIT = createRequire(import.meta.url)("../package.json")
  .engines.git.replace(/^>=/, "");
const ordinal = (v) => v.split(".").reduce((n, part) => n * 100 + Number(part), 0);

// `npm install --ignore-scripts` skips this file entirely, and git can be
// downgraded after the fact, so preflightChecks re-checks at run time (PRE-02).
// This one exists to stop the bad install, not to replace that check.
function refuse(reason, advice) {
  process.stderr.write(`git-fi requires git ${MIN_GIT} or newer, and ${reason}.\n\n${advice}`);
  process.exit(1);
}

// Pinning is the escape hatch for someone whose git is fixed by their platform:
// a long-support distribution, Apple's command line tools. 1.2.2 is the last
// release built against the older floor, so the version is a fact about history
// rather than a number that drifts.
const TOO_OLD =
  `  Upgrade git, then install git-fi again.\n` +
  `  To stay on the git you have, install the last release that supports it:\n` +
  `    npm install -g @gettyimages/git-fi@1.2.2\n`;
const NO_GIT = `  Install git ${MIN_GIT} or newer, then install git-fi again.\n`;

const probe = spawnSync("git", ["--version"], { encoding: "utf-8" });
if (probe.error || probe.status !== 0) refuse("no working git was found on PATH", NO_GIT);

const found = (probe.stdout || "").match(/\d+\.\d+\.\d+/);
if (!found) {
  refuse(
    `could not read a version from \`git --version\` (${(probe.stdout || "").trim()})`,
    NO_GIT
  );
}

if (ordinal(found[0]) < ordinal(MIN_GIT)) {
  refuse(`this system has git ${found[0]}`, TOO_OLD);
}

// The zsh pair from completions/: one file per provider that dispatches
// `git fi` (COMPLETE-02). Kept in step with install-completions' own targets by a
// test, since the names live in both places.
const FILES = ["_git-fi", "_git_fi"];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Local installs (working on git-fi itself) get nothing: the trial helper owns
// that, and a dev checkout shouldn't write into a shared prefix on npm install.
if (process.env.npm_config_global !== "true") process.exit(0);

const prefix = process.env.npm_config_prefix || process.env.PREFIX;
if (!prefix) {
  console.log(
    `git-fi: could not resolve npm's prefix, so shell completion is not installed.\n` +
      `  Install it with:  git fi install-completions --write "\${fpath[1]}"`
  );
  process.exit(0);
}

const dest = join(prefix, "share", "zsh", "site-functions");

try {
  mkdirSync(dest, { recursive: true });
  for (const file of FILES) {
    copyFileSync(join(root, "completions", file), join(dest, file));
  }
  console.log(
    `git-fi: installed zsh completion in ${dest}\n` +
      `  Open a new shell to use it. If it stays quiet, that directory is not on\n` +
      `  your fpath — install into one that is:\n` +
      `    git fi install-completions --write "\${fpath[1]}"`
  );
} catch (e) {
  console.log(
    `git-fi: could not write shell completion to ${dest} (${e.message}).\n` +
      `  Install it yourself with:  git fi install-completions --write "\${fpath[1]}"`
  );
}
