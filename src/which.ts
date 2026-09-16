// INSTALL-01: which `git-fi` a shell actually reaches.
//
// `git fi` runs whichever `git-fi` comes first on PATH, so an installation can
// be complete and still never run — the case that brought this here was a
// launcher left in Ruby's bin directory when the gem's own files were removed
// by hand, sitting ahead of npm's prefix. Nothing in that state can report
// itself: the copy that would speak up is the one not being reached.
//
// What can speak up is a copy reached some other way — `npx git-fi`, or the
// install once the shadow is gone. So the check runs where someone is already
// asking which git-fi they have (`--version`, INSTALL-01) and compares the
// launcher PATH resolves against the copy answering.
import { accessSync, constants, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { makeStyle, hintsOptedOut } from "./style.js";
import type { Options } from "./types.js";

/**
 * The launcher filenames `git fi` can reach, in the order git picks between
 * them. Measured on a Windows runner: git resolves a subcommand to
 * `git-fi.exe`, else the extensionless `git-fi`, and to nothing else. npm
 * writes `git-fi`, `git-fi.cmd` and `git-fi.ps1` into its prefix, and planting
 * a stale `.cmd`, `.bat` or `.ps1` ahead of that prefix leaves `git fi`
 * untouched.
 *
 * PATHEXT is deliberately not consulted, because the question is what `git fi`
 * runs rather than what the shell would. Both of the tools a reader reaches for
 * disagree with git here: PowerShell runs the `.ps1`, and `where.exe` lists the
 * `.cmd`. Modelling either one reports a launcher that is not in `git fi`'s way.
 */
function launcherNames(platform: string): string[] {
  return platform === "win32" ? ["git-fi.exe", "git-fi"] : ["git-fi"];
}

/**
 * Every `git-fi` launcher on PATH, first-resolved first: one entry per PATH
 * directory that holds any, since a directory earlier in the list is what
 * decides the winner. Lazy, because the only caller that matters wants the
 * first one. The platform is a parameter so the Windows ordering can be
 * asserted from any platform's test run.
 */
export function* gitFiOnPath(
  path = process.env.PATH ?? "",
  platform: string = process.platform
): Generator<string> {
  const names = launcherNames(platform);
  // The separator follows the platform being resolved for, not the one running,
  // so a Windows PATH is split the same way whoever is asking.
  const sep = platform === "win32" ? ";" : ":";
  for (const entry of path.split(sep)) {
    if (!entry || npmRunnerDir(entry)) continue;
    const hit = names.find((n) => inGitsWay(join(entry, n), platform));
    if (hit) yield join(entry, hit);
  }
}

/**
 * A directory npm puts on PATH for the life of one command — its cache for
 * `npx`, a project's own `node_modules/.bin` under `npm run`. The question here
 * is which `git-fi` a shell reaches, and a shell has none of these, so a
 * launcher found in one says nothing about it.
 *
 * Skipping them is what makes the answer reachable at all. `npx` links the copy
 * it runs into its cache and puts that first, so the walk would otherwise find
 * git-fi's own launcher, match it against the copy answering, and report that
 * nothing is shadowing — silent on the one route left to a user whose `git fi`
 * reaches somebody else's launcher.
 */
function npmRunnerDir(entry: string): boolean {
  return /[\\/]node_modules[\\/]\.bin[\\/]?$/.test(entry);
}

/**
 * Whether a launcher at this path is something `git fi` would stop at, which
 * the two platforms answer differently — measured by planting each shape ahead
 * of npm's prefix and asking `git fi` what it did.
 *
 * POSIX: git skips what it cannot execute and tries the next PATH entry, so a
 * file without the execute bit, and a symlink whose target is gone, are both
 * out of the way. `X_OK` is that rule exactly — it follows the link and tests
 * the mode in one call.
 *
 * Windows: git stops at the directory entry and fails on it —
 * `fatal: 'fi' appears to be a git command, but we were not able to execute
 * it` — rather than falling through. That is the state `gem install
 * --no-wrappers` leaves when the gem's own files are deleted by hand, since it
 * links the launcher into Ruby's bin directory rather than copying it. The link
 * still has to be found for the notice to name it, and following it is what
 * loses it, so the entry is tested rather than its target.
 */
function inGitsWay(path: string, platform: string): boolean {
  try {
    if (platform === "win32") lstatSync(path);
    else accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** `realpathSync`, or null where the path does not resolve to anything. */
function resolved(path: string): string | null {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

/**
 * The entry point a generated launcher names, resolved against the launcher's
 * own directory — the form npm's `.cmd` and `.ps1` shims write it in
 * (`%~dp0\node_modules\...`, `$basedir/node_modules/...`).
 */
function launcherTarget(launcher: string): string | null {
  let text: string;
  try {
    text = readFileSync(launcher, "utf8");
  } catch {
    return null;
  }
  const named = text.match(/node_modules[\\/][^\s"']*\.[cm]?js/);
  // The shim is written for its own platform, so it may carry backslashes that
  // are ordinary filename characters anywhere else.
  return named ? join(dirname(launcher), named[0].replace(/\\/g, "/")) : null;
}

/**
 * Whether `launcher` leads back to the copy running as `entry`.
 *
 * One rule, reached two ways: the launcher's target is the copy answering. On
 * POSIX npm links its launcher as a symlink to the entry point, so resolving
 * both settles it. Windows launchers are generated wrappers rather than
 * symlinks, so the target has to be read out of the script they are.
 *
 * Comparing resolved paths rather than matching the package name is what keeps
 * two installs distinguishable: a second npm prefix (an nvm/fnm switch) holds a
 * launcher naming the same package, and it is a different copy.
 */
export function isSameInstall(launcher: string, entry: string): boolean {
  const target = resolved(entry);
  if (!target) return false;
  if (resolved(launcher) === target) return true;
  const named = launcherTarget(launcher);
  return named !== null && resolved(named) === target;
}

/**
 * The launcher `git fi` would reach, when it is not this copy. Null when this
 * copy wins, when nothing named `git-fi` is on PATH at all, or when the running
 * entry point cannot be resolved — none of which is worth a word to the user.
 */
export function shadowingLauncher(entry: string | undefined, path?: string): string | null {
  if (!entry || !resolved(entry)) return null;
  for (const winner of gitFiOnPath(path)) {
    return isSameInstall(winner, entry) ? null : winner;
  }
  return null;
}

/** The INSTALL-01 notice body, kept pure so it can be asserted without a PATH. */
export function shadowNotice(
  winner: string,
  entry: string,
  s: ReturnType<typeof makeStyle>
): string {
  return (
    `\n${s.yellow("A different git-fi is ahead of this one on your PATH")}\n` +
    `  git fi reaches  ${winner}\n` +
    `  this copy is    ${entry}\n` +
    `Delete the one above, or put npm's bin directory (${npmBinHint()})\n` +
    `earlier on your PATH. A launcher left behind by the Ruby gem lands in\n` +
    `Ruby's bin directory, which removing the gem's own files does not touch.\n`
  );
}

/**
 * How to print the directory npm links a global launcher into, which is the
 * prefix itself on Windows and its `bin` subdirectory everywhere else — so
 * naming the prefix alone sends a POSIX reader after a directory holding no
 * `git-fi`. `npm bin -g` would answer directly but npm removed it in v9.
 */
function npmBinHint(platform: string = process.platform): string {
  return platform === "win32"
    ? "npm config get prefix"
    : '"$(npm config get prefix)/bin"';
}

/**
 * What `npx` reports instead of the notice: the launcher PATH resolves, stated
 * as a fact and nothing more.
 *
 * `npx` is the route out for a user whose `git fi` reaches somebody else's
 * launcher, since the copy that would notice is the copy not being run. But the
 * copy answering is then a throwaway npx unpacked a moment ago, so "is the
 * winner this copy?" — the question the notice is built on — has no useful
 * answer: the user's own global install is a different copy and would be
 * reported as shadowing, under a heading telling them to delete it. Naming the
 * winner answers what they ran npx to ask and cannot mislead either way.
 */
export function reachesNotice(
  winner: string,
  s: ReturnType<typeof makeStyle>
): string {
  return `\n${s.dim("git fi reaches")}  ${winner}\n`;
}

/** Whether npm is running this as `npx`, which sets both of these. */
function underNpx(): boolean {
  return process.env.npm_lifecycle_event === "npx" || process.env.npm_command === "exec";
}

/**
 * Print the notice to stderr when another launcher wins, so stdout stays a
 * clean version string for anything parsing it. `GIT_FI_NO_HINTS` opts out;
 * the update notice's other suppressions (CI, non-TTY) deliberately do not
 * apply, because here the notice is the answer to the question being asked.
 */
export function warnIfShadowed(opts: Options): void {
  if (hintsOptedOut()) return;
  const entry = process.argv[1];
  if (!entry) return;

  if (underNpx()) {
    const [winner] = gitFiOnPath();
    if (winner) process.stderr.write(reachesNotice(winner, makeStyle(opts)));
    return;
  }

  const winner = shadowingLauncher(entry);
  if (winner) process.stderr.write(shadowNotice(winner, entry, makeStyle(opts)));
}
