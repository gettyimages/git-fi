import type { Options, BranchReadiness } from "./types.js";
import { localBranchName } from "./branches.js";

const isTTY = process.stdout.isTTY === true;
const isStderrTTY = process.stderr.isTTY === true;

export function colorEnabled(opts: Options, tty = isTTY): boolean {
  if (process.env.NO_COLOR !== undefined) return false;
  if (opts.bare || opts.json) return false;
  return tty;
}

export function progressEnabled(opts: Options): boolean {
  if (opts.bare || opts.json) return false;
  return isStderrTTY;
}

/**
 * Whether advisory output is wanted — the CI-status hint (`LIST-04`) and the
 * update notice (`UPDATE-03`) share this gate. A hint asks the reader to go run
 * something, so it is addressed to a person at a terminal: in a CI job or a
 * pipe there is nobody to act on it, and it becomes a line every build log
 * carries forever.
 */
export function hintsEnabled(opts: Options, tty = isTTY): boolean {
  if (opts.bare || opts.json) return false;
  if (process.env.CI || hintsOptedOut()) return false;
  return tty;
}

/**
 * The explicit half of the gate above, split out because one advisory wants it
 * alone: the INSTALL-01 notice answers a question the user just asked, so the
 * ambient conditions (CI, a pipe) are not reasons to withhold it, while the
 * switch someone set on purpose still is.
 */
export function hintsOptedOut(): boolean {
  return Boolean(process.env.GIT_FI_NO_HINTS);
}

/**
 * Whether a glyph will read where a word would otherwise have to carry the
 * meaning (TERM-10): a status emoji, the `↓12` behind marker. Gated on colour,
 * which is already the decoration/plain-text split — a CI job log or a piped
 * run gets the word instead.
 */
export function glyphsEnabled(opts: Options, tty = isTTY): boolean {
  return colorEnabled(opts, tty);
}

/**
 * Whether OSC 8 hyperlinks will survive the destination. Deliberately not tied
 * to `colorEnabled`: `NO_COLOR` asks for no color, not for no links, so a plain
 * terminal keeps its clickable branch and pipeline references. Where this is
 * false the branch reference has to carry its URL in the text instead (`GITLAB-09`)
 * — an unrendered OSC 8 sequence drops the address entirely, which is how CI
 * logs ended up naming branches they gave no way to open.
 */
export function hyperlinksEnabled(opts: Options, tty = isTTY): boolean {
  if (opts.bare || opts.json) return false;
  return tty;
}

export function makeStyle(opts: Options, tty = isTTY) {
  const on = colorEnabled(opts, tty);
  const links = hyperlinksEnabled(opts);
  const esc = (code: string) => (on ? `\x1b[${code}m` : "");
  const reset = esc("0");
  return {
    cyan: (s: string) => `${esc("36")}${s}${reset}`,
    green: (s: string) => `${esc("32")}${s}${reset}`,
    greenBold: (s: string) => `${esc("1;32")}${s}${reset}`,
    yellow: (s: string) => `${esc("33")}${s}${reset}`,
    redBold: (s: string) => `${esc("1;31")}${s}${reset}`,
    bold: (s: string) => `${esc("1")}${s}${reset}`,
    dim: (s: string) => `${esc("2")}${s}${reset}`,
    italic: (s: string) => `${esc("3")}${s}${reset}`,
    // Closes with SGR 29 (strike off) rather than a full reset, so this can be
    // applied to the bare name and still sit inside a color or hyperlink span.
    strike: (s: string) => `${esc("9")}${s}${esc("29")}`,
    fi: () => (on ? `${esc("1")}fi${reset}` : "fi"),
    // Two renderings because the two kinds of reference are worth different
    // amounts of width off a TTY. `link` decorates — losing it costs nothing a
    // reader can't get from the id itself. `linkOrMarkdown` is for the reference
    // someone leaves the log to open, and pays a long line to keep it.
    //
    // The fallback is markdown rather than `text (url)` because of where a line
    // from a build log goes next: pasted into Slack or an issue, `[name](url)`
    // arrives as a working link. `text` is safe to put inside the brackets —
    // links and color are disabled by the same non-TTY condition, so there are
    // no escape sequences in it here.
    link: (text: string, url: string) =>
      links ? `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\` : text,
    linkOrMarkdown: (text: string, url: string) =>
      links ? `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\` : `[${text}](${url})`,
  };
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function createSpinner(message: string, opts: Options) {
  if (!progressEnabled(opts)) return { stop() {} };
  let i = 0;
  const draw = () =>
    process.stderr.write(
      `\r${SPINNER_FRAMES[i++ % SPINNER_FRAMES.length]} ${message}`
    );
  // Draw frame 0 synchronously. Most of what a spinner wraps here is a
  // synchronous `execFileSync` git call, which blocks the event loop for its
  // whole duration — so a timer-only spinner never gets to run, and `stop()`
  // clears the interval before the loop regains control. The slower the
  // command, the longer the silence it was supposed to explain.
  draw();
  const id = setInterval(draw, 80);
  return {
    stop() {
      clearInterval(id);
      process.stderr.write("\r\x1b[K");
    },
  };
}

export function createProgressLine(opts: Options) {
  const tty = progressEnabled(opts);
  const s = makeStyle(opts);
  return {
    update(message: string) {
      if (tty) {
        process.stderr.write(`\r\x1b[K${message}`);
      } else {
        process.stderr.write(`${message}\n`);
      }
    },
    done() {
      if (tty) {
        process.stderr.write(`\r\x1b[K${s.greenBold("Done!")}\n`);
      } else {
        process.stderr.write(`${s.greenBold("Done!")}\n`);
      }
    },
  };
}

/**
 * Quote a branch name or path for the command lines git-fi prints (READY-04),
 * which a person is invited to paste into a shell. Both may contain backticks,
 * `;`, `&&`, `|`, `>` and quotes — `git branch` takes them in a ref name, and a
 * filename takes anything but `/` and NUL — so ``feat`id`x`` would otherwise
 * render as a bold instruction to run it. Single quotes are the only form that
 * stops command substitution: inside double quotes a backtick still expands.
 * `'\''` closes, escapes, and reopens for a literal quote.
 *
 * Left bare when the name has nothing a shell reads, which is nearly always,
 * so the common case still reads as something you would have typed.
 */
export function shq(name: string): string {
  if (/^[A-Za-z0-9._/][A-Za-z0-9._/-]*$/.test(name)) return name;
  return `'${name.replace(/'/g, "'\\''")}'`;
}

// git's own table, `cq_lookup` in the `quote.c` behind `quote_c_style`:
// https://github.com/git/git/blob/v2.55.0/quote.c#L205
// Every other byte it escapes goes out as three-digit octal. Duplicating the
// table is what a test covers rather than a comment: it diffs this function
// against what `git ls-files` prints for the same names, so a change on git's
// side surfaces here instead of drifting.
const C_ESCAPES = new Map<number, string>([
  [0x07, "\\a"],
  [0x08, "\\b"],
  [0x09, "\\t"],
  [0x0a, "\\n"],
  [0x0b, "\\v"],
  [0x0c, "\\f"],
  [0x0d, "\\r"],
  [0x22, '\\"'],
  [0x5c, "\\\\"],
]);

/**
 * Render a path the way git prints one (READY-04): bare where it holds nothing
 * that needs escaping, otherwise double-quoted with C escapes. A filename takes
 * any byte but `/` and NUL, and `--name-only -z` hands those over intact
 * (READY-03) — so a path carrying a newline splits the report across lines, and
 * one carrying `\e[2K` repaints text git-fi has already written.
 *
 * The escaping is per byte rather than per character, which is what makes
 * `quoteNonAscii` reproduce `core.quotePath`: a path outside ASCII goes out as
 * one octal escape per UTF-8 byte, or unescaped where the reader has turned
 * that off. Bytes that were not valid UTF-8 are already lost by then — git-fi
 * reads git's output as text — so those paths render with the replacement
 * character rather than their original bytes.
 *
 * git will not read this form back: a quoted pathspec matches nothing. It is
 * how git shows a path, and the raw bytes `--json` carries are what goes back
 * into git (`--pathspec-file-nul`).
 */
export function quoteCStyle(path: string, quoteNonAscii = true): string {
  const out: number[] = [];
  let needsQuotes = false;
  const push = (esc: string): void => {
    for (let i = 0; i < esc.length; i++) out.push(esc.charCodeAt(i));
    needsQuotes = true;
  };

  for (const byte of Buffer.from(path, "utf8")) {
    const escape = C_ESCAPES.get(byte);
    if (escape !== undefined) push(escape);
    else if (byte < 0x20 || byte === 0x7f || (quoteNonAscii && byte >= 0x80)) {
      push(`\\${byte.toString(8).padStart(3, "0")}`);
    } else out.push(byte);
  }

  return needsQuotes ? `"${Buffer.from(out).toString("utf8")}"` : path;
}

export function bulletList(
  items: string[],
  opts: Options,
  gitlab?: { host: string; project: string } | null
): string {
  const s = makeStyle(opts);
  if (items.length === 0) return " <Nothing>\n";
  return (
    items
      .map((b) => {
        const name = localBranchName(b);
        const label = gitlab
          ? s.link(
              s.cyan(name),
              `https://${gitlab.host}/${gitlab.project}/-/tree/${encodeURIComponent(name)}`
            )
          : s.cyan(name);
        return ` ${s.dim("*")} ${label}`;
      })
      .join("\n") + "\n"
  );
}

/**
 * Strike a branch name that has already landed (READY-07). Applied to the bare
 * name, before any color or hyperlink wraps it.
 */
export function strikeIfMerged(
  name: string,
  readiness: BranchReadiness | undefined,
  opts: Options,
  tty = isTTY
): string {
  return readiness?.merged ? makeStyle(opts, tty).strike(name) : name;
}

/**
 * The marker that follows a branch name (READY-02, READY-07): `merged` for a
 * branch that has landed, otherwise `↓12` where the arrow will be drawn and
 * `behind 12` where it will not (TERM-10). Empty for a branch level with the
 * default branch — most branches trail it most of the time, so the marker only
 * appears where there is something to say — and empty for a branch whose count
 * git could not produce, which is a different thing from being level with it.
 *
 * `merged` supersedes the behind count rather than joining it: a landed branch
 * trails the default branch by definition, and rebasing is not what it needs.
 */
function readinessMarker(
  readiness: BranchReadiness | undefined,
  opts: Options,
  tty = isTTY
): string {
  if (!readiness) return "";
  const s = makeStyle(opts, tty);
  if (readiness.merged) return s.dim("merged");
  if (!readiness.behind) return "";
  return s.dim(
    glyphsEnabled(opts, tty)
      ? `↓${readiness.behind}`
      : `behind ${readiness.behind}`
  );
}

/** A decorated branch name plus its readiness marker. */
export function withReadiness(
  label: string,
  readiness: BranchReadiness | undefined,
  opts: Options,
  tty = isTTY
): string {
  const marker = readinessMarker(readiness, opts, tty);
  return marker ? `${label} ${marker}` : label;
}

function visibleLength(s: string): number {
  return s
    .replace(/\x1b\]8;;[^\x1b]*\x1b\\/g, "")
    .replace(/\x1b\[[0-9;]*m/g, "")
    .length;
}

function padVisible(s: string, width: number): string {
  const pad = width - visibleLength(s);
  return pad > 0 ? s + " ".repeat(pad) : s;
}

export function printTable(
  headers: string[],
  rows: string[][],
  opts: Options
): void {
  if (rows.length === 0) return;

  const widths = headers.map((h, i) =>
    Math.max(visibleLength(h), ...rows.map((r) => visibleLength(r[i] || "")))
  );
  const formatRow = (cells: string[]) =>
    cells.map((c, i) => padVisible(c, widths[i])).join(" │ ");
  const separator = widths.map((w) => "─".repeat(w)).join("─┼─");

  process.stdout.write(formatRow(headers) + "\n");
  process.stdout.write(separator + "\n");
  for (const row of rows) {
    process.stdout.write(formatRow(row) + "\n");
  }
}

export function abort(message: string, opts: Options, exitCode = 1): never {
  const s = makeStyle(opts);
  process.stderr.write(`${s.redBold(message)}\n`);
  process.exit(exitCode);
}
