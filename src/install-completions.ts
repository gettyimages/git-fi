import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import type { Options } from "./types.js";
import { abort } from "./style.js";

// Shipped completion scripts live at <package>/completions/. Both dist/ (prod)
// and src/ (tsx dev) sit one level under the package root, so `..` resolves the
// same either way.
//
// zsh has two targets because two providers dispatch `git fi` (COMPLETE-02): zsh's
// built-in _git calls _git-fi, while git's own completion wrapper — the _git
// that ships with git, and what you get on macOS/Homebrew — calls _git_fi. Both
// belong on the fpath; which one is live depends on the user's git install.
const SHELL_FILES: Record<string, string> = {
  bash: "git-fi.bash",
  zsh: "_git-fi",
  "zsh-git": "_git_fi",
};

// The zsh targets, in the order --write reports them. Naming no target writes
// both, so one command covers whichever provider the user's git install has.
const ZSH_TARGETS = ["zsh", "zsh-git"];

const USAGE =
  `Usage: git fi install-completions <bash|zsh|zsh-git>\n` +
  `       git fi install-completions [zsh|zsh-git] --write <fpath-dir>`;

// System fpath directories (/usr/share/zsh/..., a Homebrew prefix) are often not
// yours to write to, so point at a directory that is.
const OWN_DIR_HINT =
  `Pick a directory you own and put it on your fpath, e.g.:\n` +
  `  echo 'fpath=(~/.zsh/completions $fpath)' >> ~/.zshrc   # before compinit\n` +
  `  git fi install-completions --write ~/.zsh/completions`;

function scriptFor(target: string, opts: Options): string {
  const file = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "completions",
    SHELL_FILES[target]
  );
  try {
    return readFileSync(file, "utf8");
  } catch {
    abort(`Completion script not found at ${file}`, opts);
  }
}

/**
 * Write the zsh completion files for `targets` into `dir` (created if missing),
 * naming each path written. This is the only thing git-fi writes outside the
 * repo, and it writes only onto a directory the user named: an rc file is still
 * theirs to edit, so `compinit` is reported as a step rather than run for them.
 */
function writeToFpath(
  targets: string[],
  dir: string,
  opts: Options
): void {
  const scripts = targets.map((t) => ({ file: SHELL_FILES[t], body: scriptFor(t, opts) }));

  try {
    mkdirSync(dir, { recursive: true });
  } catch (e) {
    abort(`Cannot create ${dir}: ${(e as Error).message}\n${OWN_DIR_HINT}`, opts);
  }

  const written: string[] = [];
  for (const { file, body } of scripts) {
    const dest = join(dir, file);
    try {
      writeFileSync(dest, body);
    } catch (e) {
      abort(`Cannot write ${dest}: ${(e as Error).message}\n${OWN_DIR_HINT}`, opts);
    }
    written.push(dest);
  }

  process.stdout.write(
    written.map((p) => `Wrote ${p}\n`).join("") +
      `Reload completions with:  autoload -Uz compinit && compinit\n` +
      `(or just open a new shell). If ${dir} is not on your fpath, add it.\n`
  );
}

/**
 * Print a completion script to stdout for sourcing — e.g. `source <(git fi
 * install-completions bash)` — or, with `--write <dir>`, install the zsh files
 * onto an fpath directory the user names. Either way git-fi never edits their
 * rc files.
 *
 * `args` are the subcommand's own arguments: an optional target
 * (`bash`/`zsh`/`zsh-git`, else detected from $SHELL) and `--write <dir>`.
 */
export function installCompletions(args: string[], opts: Options): void {
  let target: string | undefined;
  let writeDir: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--write") {
      writeDir = args[++i];
      if (!writeDir) abort(`${USAGE}\n--write needs a directory`, opts);
    } else if (arg.startsWith("-")) {
      abort(`${USAGE}\nUnknown option: ${arg}`, opts);
    } else if (target) {
      abort(`${USAGE}\nUnexpected argument: ${arg}`, opts);
    } else {
      target = arg;
    }
  }

  if (writeDir) {
    // --write installs onto the zsh fpath, so a named target must be a zsh one;
    // bash completion is sourced from an rc file and has no fpath to land on.
    if (target && !ZSH_TARGETS.includes(target)) {
      abort(
        `${USAGE}\n--write installs the zsh fpath files (zsh, zsh-git), not ${target}.\n` +
          `For bash, source the script instead:  source <(git fi install-completions bash)`,
        opts
      );
    }
    writeToFpath(target ? [target] : ZSH_TARGETS, writeDir, opts);
    return;
  }

  let shell = target;
  if (!shell) {
    const detected = process.env.SHELL ? basename(process.env.SHELL) : "";
    if (detected === "bash" || detected === "zsh") shell = detected;
  }

  if (!shell || !(shell in SHELL_FILES)) {
    abort(
      `${USAGE}\n` +
        `Could not detect a supported shell from $SHELL — pass bash, zsh, or zsh-git.\n` +
        `Enable it with, e.g.:  source <(git fi install-completions bash)`,
      opts
    );
  }

  process.stdout.write(scriptFor(shell, opts));
}
