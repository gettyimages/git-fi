import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { git } from "./git.js";

// The package root, one level up from this module whether it runs as
// `dist/build-info.js` or as `src/build-info.ts` under tsx.
const PKG_ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * A checkout carries a `.git`; a published tarball never does, because npm's
 * `files` list ships only `dist`, `man`, `completions`, and the postinstall
 * script. That marker at the *package* root — not the user's cwd, which is
 * a git repo on every ordinary run — is what separates a `just trial-on` link
 * from an installed copy (BUILD-01), and it costs one stat.
 */
export function isDevBuild(): boolean {
  return existsSync(join(PKG_ROOT, ".git"));
}

/**
 * The version string to print, marking an unpublished build with the commit it
 * was built from (BUILD-02). The `g` prefix is git-describe's, and it is what
 * keeps the identifier valid semver: a bare sha of all digits would be a
 * numeric identifier, which may not carry leading zeros.
 */
export function describeVersion(version: string): string {
  if (!isDevBuild()) return version;

  const sha = git(["-C", PKG_ROOT, "rev-parse", "--short", "HEAD"], { allowFailure: true });
  if (!sha) return `${version}-dev`;

  const dirty = git(["-C", PKG_ROOT, "status", "--porcelain"], { allowFailure: true });
  return `${version}-dev.g${sha}${dirty ? ".dirty" : ""}`;
}
