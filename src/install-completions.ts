import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import type { Options } from "./types.js";
import { abort } from "./style.js";

// Shipped completion scripts live at <package>/completions/. Both dist/ (prod)
// and src/ (tsx dev) sit one level under the package root, so `..` resolves the
// same either way.
const SHELL_FILES: Record<string, string> = {
  bash: "git-fi.bash",
  zsh: "_git-fi",
};

/**
 * Print the completion script for `shellArg` (or the shell detected from
 * $SHELL) to stdout, for sourcing — e.g. `source <(git fi install-completions
 * bash)`. Writing to the shell's rc/fpath is left to the user so we never edit
 * their dotfiles.
 */
export function installCompletions(
  shellArg: string | undefined,
  opts: Options
): void {
  let shell = shellArg;
  if (!shell) {
    const detected = process.env.SHELL ? basename(process.env.SHELL) : "";
    if (detected === "bash" || detected === "zsh") shell = detected;
  }

  if (shell !== "bash" && shell !== "zsh") {
    abort(
      `Usage: git fi install-completions <bash|zsh>\n` +
        `Could not detect a supported shell from $SHELL — pass bash or zsh.\n` +
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
