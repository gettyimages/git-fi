// Single source of truth for git-fi's flags and help text.
//
// This module has no runtime dependencies so it can be imported both by the
// CLI (for `-h` / the `help` subcommand) and by scripts/gen-docs.ts, which
// generates the man page and shell completions from the same metadata. Keep
// it dependency-free.

export interface Flag {
  /** Long form without the leading dashes, e.g. "add". */
  long: string;
  /**
   * Single-character short form without the dash, e.g. "a". Absent for the
   * once-per-machine flags (OPTION-12, OPTION-13) — the single letters are
   * worth more to a flag someone types daily.
   */
  short?: string;
  /** One-line description. */
  desc: string;
  /**
   * Argument syntax appended to the long form in help, man, and docs, e.g.
   * "[=<action>]" or " <hostname>". Flags without one take no value.
   */
  arg?: string;
  /** Completion candidates for the flag's value (AUTH-12). */
  values?: string[];
}

export const DOCS_URL = "https://gettyimages.github.io/git-fi/";

export const TAGLINE =
  "Maintain a temporary integration branch for early conflict detection.";

export const ACTIONS: Flag[] = [
  { long: "add", short: "a", desc: "Add branch(es) to fi" },
  { long: "remove", short: "r", desc: "Remove branch(es) from fi" },
  { long: "force", short: "f", desc: "Replace fi contents with only the given branch(es)" },
  { long: "again", short: "g", desc: "Re-merge fi, dropping dead and already-merged branches" },
  { long: "abort", short: "A", desc: "Re-pull fi from origin" },
];

export const OPTIONS: Flag[] = [
  { long: "debug", short: "d", desc: "Trace git commands and how long each takes" },
  { long: "bare", short: "b", desc: "Machine-readable output: space-separated branch names" },
  { long: "json", short: "j", desc: "Structured JSON output" },
  { long: "select", short: "s", desc: "Interactive branch picker (requires a TTY)" },
  { long: "yes", short: "y", desc: "Bootstrap fi without the confirmation prompt (for CI/scripts)" },
  { long: "update", short: "u", desc: "Update git-fi itself to the latest published version" },
  {
    long: "auth",
    desc: "Report which GitLab token is in effect; =login stores one, =logout removes it",
    arg: "[=<action>]",
    values: ["login", "status", "logout"],
  },
  {
    long: "host",
    desc: "Which GitLab host --auth acts on (default: from the origin remote)",
    arg: " <hostname>",
  },
  { long: "version", short: "V", desc: "Print version and exit" },
  { long: "help", short: "h", desc: "Show this help" },
];

/** Long form with its argument syntax, e.g. `--auth[=<action>]`. */
export function longForm(f: Flag): string {
  return `--${f.long}${f.arg ?? ""}`;
}

export interface Subcommand {
  /** Invocation, e.g. "install-completions <bash|zsh|zsh-git>". */
  usage: string;
  desc: string;
}

export const SUBCOMMANDS: Subcommand[] = [
  { usage: "help", desc: "Show this help (git intercepts --help, routing it to the man page)" },
  { usage: "install-completions <bash|zsh|zsh-git>", desc: "Print the shell completion script (zsh-git: for git's own zsh wrapper)" },
  { usage: "install-completions --write <dir>", desc: "Write both zsh completion files onto an fpath directory" },
];

// A long-only flag is indented by the width of the "-x, " it does not have, so
// every long form still starts in the same column.
function flagLabel(f: Flag): string {
  return f.short ? `-${f.short}, ${longForm(f)}` : `    ${longForm(f)}`;
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
