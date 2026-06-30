import type { CIResult } from "./types.js";
import { makeStyle } from "./style.js";

const ESC = "\x1b[";

function hideCursor(): void {
  process.stdout.write(`${ESC}?25l`);
}

function showCursor(): void {
  process.stdout.write(`${ESC}?25h`);
}

function clearLines(count: number): void {
  for (let i = 0; i < count; i++) {
    process.stdout.write(`${ESC}2K`);
    if (i < count - 1) process.stdout.write(`${ESC}1A`);
  }
  process.stdout.write("\r");
}

const STATUS_EMOJI: Record<string, string> = {
  success: "\u2705",
  failed: "\u274C",
  timeout: "\u23F0",
  running: "\u23F3",
  pending: "\u23F3",
  missing: "\u2796",
  skipped: "\u23ED\uFE0F",
};

function renderPicker(
  title: string,
  branches: string[],
  selected: Set<string>,
  cursor: number,
  ciData?: Map<string, CIResult>
): number {
  const s = makeStyle({ debug: false, bare: false, json: false, select: false, yes: false });
  const lines: string[] = [];
  lines.push(`\x1b[1m${title}\x1b[0m`);
  lines.push("");

  const maxBranchLen = ciData
    ? Math.max(...branches.map((b) => b.replace(/^origin\//, "").length))
    : 0;

  for (let i = 0; i < branches.length; i++) {
    const arrow = i === cursor ? "❯ " : "  ";
    const toggle = selected.has(branches[i]) ? `\x1b[32m◉ \x1b[0m` : "○ ";
    const name = branches[i].replace(/^origin\//, "");
    let line = `${arrow}${toggle}\x1b[36m${name}\x1b[0m`;

    if (ciData) {
      const ci = ciData.get(branches[i]);
      const pad = " ".repeat(maxBranchLen - name.length + 2);
      const emoji = STATUS_EMOJI[ci?.status ?? "missing"] ?? STATUS_EMOJI.missing;
      const pipeline = ci?.pipelineId ? `${ci.pipelineId} ${emoji}` : emoji;
      const date = ci?.date ? `\x1b[2m${ci.date}\x1b[0m` : "";
      const author = ci?.author ? `\x1b[2m${ci.author}\x1b[0m` : "";
      line += `${pad}${date}  ${author}  ${pipeline}`;
    }

    lines.push(line);
  }
  lines.push("");
  lines.push("\x1b[2m[Space] toggle [a] toggle all [Enter] confirm [Esc] cancel\x1b[0m");

  process.stdout.write(lines.join("\n") + "\n");
  return lines.length;
}

function readKey(): Promise<Buffer> {
  return new Promise((resolve) => {
    const onData = (data: Buffer) => {
      process.stdin.removeListener("data", onData);
      resolve(data);
    };
    process.stdin.on("data", onData);
  });
}

export async function pickBranches(
  branches: string[],
  title: string,
  initialSelected: string[] = [],
  ciData?: Map<string, CIResult>
): Promise<string[] | null> {
  if (branches.length === 0) return [];

  const selected = new Set(initialSelected);
  let cursor = 0;

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf-8");
  hideCursor();

  let lineCount = renderPicker(title, branches, selected, cursor, ciData);

  try {
    while (true) {
      const key = await readKey();
      const str = key.toString();

      if (str === "\x1b[A" || str === "k") {
        cursor = (cursor - 1 + branches.length) % branches.length;
      } else if (str === "\x1b[B" || str === "j") {
        cursor = (cursor + 1) % branches.length;
      } else if (str === " ") {
        const b = branches[cursor];
        if (selected.has(b)) selected.delete(b);
        else selected.add(b);
      } else if (str === "a") {
        if (selected.size === branches.length) selected.clear();
        else branches.forEach((b) => selected.add(b));
      } else if (str === "\r") {
        return branches.filter((b) => selected.has(b));
      } else if (str === "\x1b" || str === "q") {
        return null;
      } else if (str === "\x03") {
        process.exit(130);
      }

      clearLines(lineCount + 1);
      lineCount = renderPicker(title, branches, selected, cursor, ciData);
    }
  } finally {
    showCursor();
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
}

export async function confirm(
  message: string,
  _detail?: string
): Promise<boolean> {
  process.stdout.write(`${message}\n`);
  process.stdout.write("See: https://github.com/gettyimages/git-fi\n");
  process.stdout.write("\ny - yes\nanything else: no\n\n");
  process.stdout.write("\x1b[1mAre you sure? \x1b[0m");

  process.stdin.setRawMode(true);
  process.stdin.resume();

  try {
    const key = await readKey();
    const str = key.toString();
    process.stdout.write("\n");
    return str === "y";
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
}
