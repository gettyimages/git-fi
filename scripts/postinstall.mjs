#!/usr/bin/env node
// Install the zsh completion files as part of `npm install -g` (COMPLETE-07), so tab
// completion works out of the box instead of being a step the user has to find.
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
//
// This never fails an install. A prefix we cannot write to (a root-owned
// /usr/local, a distro package) prints the one command that finishes the job and
// exits 0.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
