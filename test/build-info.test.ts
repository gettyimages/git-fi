import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const { version } = createRequire(import.meta.url)("../package.json");
const ROOT = fileURLToPath(new URL("..", import.meta.url));

const trash: string[] = [];
function scratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  trash.push(dir);
  return dir;
}

/**
 * Stage the layout npm installs — `dist/` beside a `package.json` — so each case
 * exercises the real binary rather than asserting from the shape of the code.
 * `git` turns the staging into a committed checkout; `emptyGitDir` recreates the
 * degenerate case where the marker is present but no commit can be read.
 */
function stagePackage(opts: { git?: boolean; emptyGitDir?: boolean } = {}): string {
  const pkg = scratchDir("git-fi-pkg-");
  cpSync(join(ROOT, "dist"), join(pkg, "dist"), { recursive: true });
  cpSync(join(ROOT, "package.json"), join(pkg, "package.json"));

  if (opts.emptyGitDir) mkdirSync(join(pkg, ".git"));
  if (opts.git) commitEverything(pkg);
  return pkg;
}

/** A checkout whose tree matches HEAD exactly, so `.dirty` is a test's to add. */
function commitEverything(repo: string): void {
  const noHooks = scratchDir("git-fi-nohooks-");
  const git = (args: string[]) =>
    execFileSync("git", ["-C", repo, ...args], { stdio: ["pipe", "pipe", "pipe"] });
  git(["init", "--quiet", "-b", "main"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Test"]);
  git(["config", "commit.gpgsign", "false"]);
  git(["config", "core.hooksPath", noHooks]);
  git(["add", "-A"]);
  git(["commit", "--quiet", "-m", "seed"]);
}

function versionOf(pkg: string, cwd: string): string {
  const r = spawnSync(process.execPath, [join(pkg, "dist", "index.js"), "--version"], {
    cwd,
    encoding: "utf-8",
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

describe("build provenance (BUILD-01, BUILD-02)", () => {
  let cwd: string;

  before(() => {
    // Run from a git repo, so no case can pass by accident on a cwd that has no
    // `.git`: the marker that decides this is the package's, not the caller's.
    cwd = scratchDir("git-fi-cwd-");
    execFileSync("git", ["init", "--quiet", "-b", "main", cwd]);
  });
  after(() => {
    for (const dir of trash) rmSync(dir, { recursive: true, force: true });
  });

  test("an installed copy reports the published version alone", () => {
    assert.equal(versionOf(stagePackage(), cwd), `git-fi ${version}`);
  });

  test("a checkout reports the commit it was built from", () => {
    const pkg = stagePackage({ git: true });
    const sha = execFileSync("git", ["-C", pkg, "rev-parse", "--short", "HEAD"], {
      encoding: "utf-8",
    }).trim();
    assert.equal(versionOf(pkg, cwd), `git-fi ${version}-dev.g${sha}`);
  });

  test("a checkout whose tree has moved off that commit says so", () => {
    const pkg = stagePackage({ git: true });
    writeFileSync(join(pkg, "uncommitted.txt"), "work in progress\n");
    assert.equal(versionOf(pkg, cwd).endsWith(".dirty"), true);
  });

  test("a checkout with no readable commit is still marked as a dev build", () => {
    assert.equal(versionOf(stagePackage({ emptyGitDir: true }), cwd), `git-fi ${version}-dev`);
  });
});
