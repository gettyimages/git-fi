import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Options } from "./types.js";
import { makeStyle } from "./style.js";

const ONE_DAY_MS = 1000 * 60 * 60 * 24;

export function cachePath(): string {
  const base = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(base, "git-fi", "update-check.json");
}

export function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) => v.split("-")[0].split(".").map((n) => parseInt(n, 10) || 0);
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < 3; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

function suppressed(opts: Options): boolean {
  return Boolean(
    opts.json ||
      opts.bare ||
      !process.stdout.isTTY ||
      process.env.CI ||
      process.env.GIT_FI_NO_HINTS ||
      process.env.NO_UPDATE_NOTIFIER
  );
}

/**
 * Print a deferred notice when a newer version is known, and refresh the cached
 * version in a detached background process (throttled to once per day). Returns
 * immediately and never blocks the command. Inert for machine output, non-TTY,
 * and CI (see suppressed).
 */
export function notifyUpdate(name: string, current: string, opts: Options): void {
  if (suppressed(opts)) return;

  const file = cachePath();
  let latest: string | undefined;
  let checkedAt = 0;
  try {
    const cache = JSON.parse(readFileSync(file, "utf-8"));
    if (typeof cache.latest === "string") latest = cache.latest;
    if (typeof cache.checkedAt === "number") checkedAt = cache.checkedAt;
  } catch {
    // no cache yet — first run refreshes it for next time
  }

  if (latest && isNewer(latest, current)) {
    const s = makeStyle(opts);
    process.on("exit", () => {
      process.stderr.write(
        `\n${s.yellow("Update available")} ${s.dim(current)} → ${s.greenBold(latest!)}\n` +
          `Run ${s.bold(`npm install -g ${name}`)} to update.\n`
      );
    });
  }

  if (Date.now() - checkedAt > ONE_DAY_MS) {
    try {
      const worker = fileURLToPath(new URL("./update-worker.js", import.meta.url));
      spawn(process.execPath, [worker, name, file], {
        detached: true,
        stdio: "ignore",
      }).unref();
    } catch {
      // best-effort: a spawn failure must never block the command
    }
  }
}
