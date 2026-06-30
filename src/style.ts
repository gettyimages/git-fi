import type { Options } from "./types.js";

const isTTY = process.stdout.isTTY === true;
const isStderrTTY = process.stderr.isTTY === true;

export function colorEnabled(opts: Options): boolean {
  if (process.env.NO_COLOR !== undefined) return false;
  if (opts.bare || opts.json) return false;
  return isTTY;
}

export function progressEnabled(opts: Options): boolean {
  if (opts.bare || opts.json) return false;
  return isStderrTTY;
}

export function makeStyle(opts: Options) {
  const on = colorEnabled(opts);
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
    fi: () => (on ? `${esc("1")}fi${reset}` : "fi"),
    link: (text: string, url: string) =>
      on ? `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\` : text,
  };
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function createSpinner(message: string, opts: Options) {
  if (!progressEnabled(opts)) return { stop() {} };
  let i = 0;
  const id = setInterval(() => {
    process.stderr.write(
      `\r${SPINNER_FRAMES[i++ % SPINNER_FRAMES.length]} ${message}`
    );
  }, 80);
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
        const name = b.replace(/^origin\//, "");
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
