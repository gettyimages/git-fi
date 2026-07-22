// Single source of truth for git-fi's flags and help text.
//
// This module has no runtime dependencies so it can be imported both by the
// CLI (for `-h` / the `help` subcommand) and by scripts/gen-docs.ts, which
// generates the man page and shell completions from the same metadata. Keep
// it dependency-free.

export interface Flag {
  /** Long form without the leading dashes, e.g. "add". */
  long: string;
  /** Single-character short form without the dash, e.g. "a". */
  short: string;
  /** One-line description. */
  desc: string;
}

export const DOCS_URL = "https://gettyimages.github.io/git-fi/";

export const TAGLINE =
  "Maintain a temporary integration branch for early conflict detection.";

export const ACTIONS: Flag[] = [
  { long: "add", short: "a", desc: "Add branch(es) to fi" },
  { long: "remove", short: "r", desc: "Remove branch(es) from fi" },
  { long: "force", short: "f", desc: "Replace fi contents with only the given branch(es)" },
  { long: "again", short: "g", desc: "Re-merge all branches currently in fi" },
  { long: "prune", short: "p", desc: "Remove dead/already-merged branches from fi" },
  { long: "abort", short: "A", desc: "Re-pull fi from origin" },
];

export const OPTIONS: Flag[] = [
  { long: "debug", short: "d", desc: "Print git commands as they execute" },
  { long: "bare", short: "b", desc: "Machine-readable output (space-separated branch names; list only)" },
  { long: "json", short: "j", desc: "Structured JSON output (list only)" },
  { long: "select", short: "s", desc: "Interactive branch picker (requires a TTY)" },
  { long: "yes", short: "y", desc: "Bootstrap fi without the confirmation prompt (for CI/scripts)" },
  { long: "version", short: "V", desc: "Print version and exit" },
  { long: "help", short: "h", desc: "Show this help" },
];

export interface Subcommand {
  /** Invocation, e.g. "install-completions <bash|zsh>". */
  usage: string;
  desc: string;
}

export const SUBCOMMANDS: Subcommand[] = [
  { usage: "help", desc: "Show this help (git intercepts --help, routing it to the man page)" },
  { usage: "install-completions <bash|zsh>", desc: "Print the shell completion script for sourcing" },
];

function flagLabel(f: Flag): string {
  return `-${f.short}, --${f.long}`;
}

/** Plain-text help, shared by `git fi -h` and `git fi help`. */
export function renderHelp(): string {
  const flags = [...ACTIONS, ...OPTIONS];
  // One column width across flags and subcommands so all descriptions align.
  const width =
    Math.max(
      ...flags.map((f) => flagLabel(f).length),
      ...SUBCOMMANDS.map((c) => c.usage.length)
    ) + 3;
  const line = (f: Flag) => `  ${flagLabel(f).padEnd(width)}${f.desc}`;
  const cmdLine = (c: Subcommand) => `  ${c.usage.padEnd(width)}${c.desc}`;

  return (
    `Usage: git fi [options] [<branch>...]\n` +
    `\n` +
    `${TAGLINE}\n` +
    `\n` +
    `Actions:\n` +
    ACTIONS.map(line).join("\n") + "\n" +
    `\n` +
    `Options:\n` +
    OPTIONS.map(line).join("\n") + "\n" +
    `\n` +
    `Commands:\n` +
    SUBCOMMANDS.map(cmdLine).join("\n") + "\n" +
    `\n` +
    `Full documentation: ${DOCS_URL}\n`
  );
}
