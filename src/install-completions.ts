import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import type { Options } from "./types.js";
import { abort } from "./style.js";

// Shipped completion scripts live at <package>/completions/. Both dist/ (prod)
// and src/ (tsx dev) sit one level under the package root, so `..` resolves the
// same either way.
//
// zsh has two targets because two providers dispatch `git fi` (CMP-02): zsh's
// built-in _git calls _git-fi, while git's own completion wrapper — the _git
// that ships with git, and what you get on macOS/Homebrew — calls _git_fi. Both
// belong on the fpath; which one is live depends on the user's git install.
const SHELL_FILES: Record<string, string> = {
  bash: "git-fi.bash",
  zsh: "_git-fi",
  "zsh-git": "_git_fi",
};

const USAGE = `Usage: git fi install-completions <bash|zsh|zsh-git>`;

/**
 * Print the completion script for `target` (or the shell detected from $SHELL)
 * to stdout, for sourcing — e.g. `source <(git fi install-completions bash)` —
 * or for writing onto the zsh fpath. Writing to the shell's rc/fpath is left to
 * the user so we never edit their dotfiles.
 */
export function installCompletions(
  target: string | undefined,
  opts: Options
): void {
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

  const file = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "completions",
    SHELL_FILES[shell]
  );
  let script: string;
  try {
    script = readFileSync(file, "utf8");
  } catch {
    abort(`Completion script not found at ${file}`, opts);
  }
  process.stdout.write(script);
}
