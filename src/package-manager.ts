// UPDATE-05: the package manager that installed git-fi, and how to have it
// install the latest version over this copy.
//
// Everything that differs between package managers lives in a subclass: how to
// tell it installed the running copy, the command that replaces a global
// install, where to run it, and what to say when it can't be run. Supporting
// another one is a subclass and an entry in `PackageManager.detect`.
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

export abstract class PackageManager {
  /** The command run, and the name used when it can't be. */
  abstract readonly command: string;

  /** The arguments that install `pkg@latest` globally, replacing this copy. */
  protected abstract installLatestArgs(pkg: string): string[];

  /** Whether this package manager installed the copy running as `entry`. */
  protected abstract installed(pkg: string, entry: string): boolean;

  /** The directory to run the install from; undefined keeps the caller's. */
  protected get cwd(): string | undefined {
    return undefined;
  }

  /** A line to add when the command can't be run, or null for none. */
  get notFoundHint(): string | null {
    return null;
  }

  /**
   * The package manager that installed the copy running as `entry`. npm is the
   * fallback: it is what git-fi has always updated with, and it covers every
   * install no other package manager claims (npx, a dev-trial link).
   */
  static detect(pkg: string, entry: string | undefined = process.argv[1]): PackageManager {
    const candidates: PackageManager[] = [new Pnpm()];
    return (entry && candidates.find((pm) => pm.installed(pkg, entry))) || new Npm();
  }

  /** Install `pkg@latest` globally with stdio inherited, so its output is the user's to read. */
  installLatest(pkg: string): SpawnSyncReturns<Buffer> {
    return spawnSync(this.command, this.installLatestArgs(pkg), {
      stdio: "inherit",
      cwd: this.cwd,
      // On Windows npm and pnpm are .cmd shims, which node refuses to spawn
      // directly (EINVAL, the CVE-2024-27980 hardening) and finds by bare name
      // not at all — so the shell does the PATHEXT lookup. Every argument here
      // is a fixed literal, so there is nothing for cmd's parser to mangle.
      shell: process.platform === "win32",
    });
  }
}

export class Npm extends PackageManager {
  readonly command = "npm";

  // `install`, not `update`: npm's `update -g` leaves an installed global alone.
  protected installLatestArgs(pkg: string): string[] {
    return ["install", "-g", `${pkg}@latest`];
  }

  // The fallback in `detect`, so never asked.
  protected installed(): boolean {
    return true;
  }
}

export class Pnpm extends PackageManager {
  readonly command = "pnpm";

  protected installLatestArgs(pkg: string): string[] {
    return ["add", "-g", `${pkg}@latest`];
  }

  /**
   * pnpm writes `.modules.yaml` into every `node_modules` it manages, and npm
   * never does.
   *
   * Reading a file rather than asking pnpm keeps the answer independent of how
   * pnpm itself got onto the machine. Under corepack, `pnpm root -g` answers for
   * whichever pnpm the current directory's `packageManager` field (or corepack's
   * last-known-good) selects, which need not be the one that installed git-fi —
   * and in a yarn-pinned repo it refuses to run at all.
   *
   * Both the launch path and its resolved path are tried. pnpm's launchers are
   * generated scripts that hand node the path inside its global directory, which
   * is where the marker sits; its newer layouts resolve that path into the store,
   * where there is none. npm's POSIX launcher is a symlink, so only the resolved
   * path reaches the package at all.
   *
   * Only the `node_modules` directly holding the package counts, not any
   * ancestor: npm's global prefix can itself sit inside a pnpm-managed tree when
   * node is a pnpm global, and that copy is still npm's.
   */
  protected installed(pkg: string, entry: string): boolean {
    // Normalized, so a `./` segment can't throw off the walk up from the entry.
    const paths = [resolve(entry)];
    try {
      paths.push(realpathSync(entry));
    } catch {
      // an unresolvable entry leaves only the path as given
    }
    return paths.some((path) => {
      // dist/index.js → the package directory → past its name to node_modules
      const pkgDir = dirname(dirname(path));
      const modulesDir = pkg.split("/").reduce((dir) => dirname(dir), pkgDir);
      return basename(modulesDir) === "node_modules" && existsSync(join(modulesDir, ".modules.yaml"));
    });
  }

  /**
   * Outside any project. Corepack and pnpm's own version management both follow
   * the nearest `packageManager` field, so run from a repo they could pick
   * another pnpm (with another global directory) or, in a yarn-pinned repo,
   * refuse outright. A global install has no other use for the directory.
   */
  protected get cwd(): string {
    return tmpdir();
  }

  // Falling back to npm would install a second copy behind the one PATH
  // reaches, so point at how pnpm gets onto PATH instead.
  get notFoundHint(): string {
    return "git-fi was installed with pnpm; put pnpm on your PATH (with corepack: corepack enable pnpm) and retry.";
  }
}
