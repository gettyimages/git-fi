import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Options } from "./types.js";
import { makeStyle, hintsEnabled } from "./style.js";

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

// The machine-output, CI, non-TTY, and GIT_FI_NO_HINTS conditions are the shared
// advisory gate (LIST-04 says the same of the token hint); NO_UPDATE_NOTIFIER is
// this notice's own opt-out.
function suppressed(opts: Options): boolean {
  return !hintsEnabled(opts) || Boolean(process.env.NO_UPDATE_NOTIFIER);
}

/**
 * The notice body, split out from the exit handler below so it can be asserted
 * on without a TTY. It names `git fi --update` rather than the npm command it
 * runs (UPDATE-01): the reader would otherwise have to get a scoped package name
 * right, and guess that npm's verb for replacing an already-installed global is
 * `install`, not the more obvious `update`.
 */
export function updateNotice(
  current: string,
  latest: string,
  s: ReturnType<typeof makeStyle>
): string {
  return (
    `\n${s.yellow("Update available")} ${s.dim(current)} → ${s.greenBold(latest)}\n` +
    `Run ${s.bold("git fi --update")} to update.\n`
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
      process.stderr.write(updateNotice(current, latest!, s));
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

/**
 * Hand the update to npm and exit with its verdict. npm's stdio is inherited
 * and its exit code becomes ours, so a registry outage, a permissions error, or
 * a successful install all read exactly as npm already reports them.
 *
 * The cache is deliberately not consulted first: the 24-hour throttle (UPDATE-02)
 * exists to keep a *passive* notice cheap, whereas `--update` is the user asking
 * for the install now — answering that with "you're already current" is worse
 * than a redundant reinstall.
 */
export function updateSelf(name: string): never {
  const npm = spawnSync("npm", ["install", "-g", `${name}@latest`], {
    stdio: "inherit",
  });
  if (npm.error) {
    process.stderr.write(`Could not run npm: ${npm.error.message}\n`);
    process.exit(1);
  }
  process.exit(npm.status ?? 1);
}
