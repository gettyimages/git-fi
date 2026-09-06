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
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { makeStyle, hintsOptedOut } from "./style.js";
import type { Options } from "./types.js";

/**
 * The launcher filenames to look for in one directory, in the order a shell
 * picks between them. Windows resolves by extension before it falls back to the
 * bare name, which is why the extensionless RubyGems launcher only wins where
 * no `.bat`/`.cmd` sibling survived it (verified on a Windows runner).
 * `.ps1` leads because PowerShell prefers its own script, which is why it is
 * added rather than filtered for: Windows leaves it out of PATHEXT.
 */
function launcherNames(platform: string, pathext: string): string[] {
  if (platform !== "win32") return ["git-fi"];
  const exts = [".PS1", ...(pathext || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)];
  return [...exts.map((e) => `git-fi${e.toLowerCase()}`), "git-fi"];
}

/**
 * Every `git-fi` launcher on PATH, first-resolved first: one entry per PATH
 * directory that holds any, since a directory earlier in the list is what
 * decides the winner. Lazy, because the only caller that matters wants the
 * first one and a Windows PATH costs a dozen probes per directory to search.
 * The environment is a parameter so the Windows ordering can be asserted from
 * any platform's test run.
 */
export function* gitFiOnPath(
  path = process.env.PATH ?? "",
  platform: string = process.platform,
  pathext = process.env.PATHEXT ?? ""
): Generator<string> {
  const names = launcherNames(platform, pathext);
  // The separator follows the platform being resolved for, not the one running,
  // so a Windows PATH is split the same way whoever is asking.
  const sep = platform === "win32" ? ";" : ":";
  for (const entry of path.split(sep)) {
    if (!entry) continue;
    const hit = names.find((n) => existsSync(join(entry, n)));
    if (hit) yield join(entry, hit);
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
    `Delete the one above, or put npm's prefix (npm config get prefix) earlier\n` +
    `on your PATH. A launcher left behind by the Ruby gem lands in Ruby's bin\n` +
    `directory, which removing the gem's own files does not touch.\n`
  );
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
  const winner = shadowingLauncher(entry);
  if (winner) process.stderr.write(shadowNotice(winner, entry, makeStyle(opts)));
}
