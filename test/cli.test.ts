import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { runFi, makeSandbox, type Sandbox } from "./helpers.ts";

const { version } = createRequire(import.meta.url)("../package.json");

/** Branch names present in a plain (non-token) list, in display order. */
function listedBranches(sb: Sandbox): string[] {
  const r = runFi(["--bare"], sb.work, { GIT_FI_NO_HINTS: "1" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim().length ? r.stdout.trim().split(/\s+/) : [];
}

describe("argument handling (no repo required)", () => {
  let dir: string;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), "git-fi-bare-"));
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  test("--version prints the package version and exits 0", () => {
    const r = runFi(["--version"], dir);
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), `git-fi ${version}`);
  });

  test("--help prints usage and exits 0", () => {
    const r = runFi(["--help"], dir);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Usage: git fi/);
  });

  test("aborts outside a git repository and points to the docs", () => {
    const r = runFi([], dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /No \.git directory found\./);
    assert.match(r.stderr, /gettyimages\.github\.io\/git-fi/);
  });

  test("unknown option aborts", () => {
    const r = runFi(["--bogus"], dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Unknown option/);
  });

  test("conflicting actions abort", () => {
    const r = runFi(["--add", "--remove", "x"], dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Cannot combine/);
  });

  test("--json is rejected for non-list actions", () => {
    const r = runFi(["--json", "--add", "x"], dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /--json is only valid with the list/);
  });

  test("--bare is rejected for non-list actions", () => {
    const r = runFi(["--bare", "--add", "x"], dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /--bare is only valid with the list/);
  });
});

describe("preflight checks", () => {
  let sb: Sandbox;
  before(() => {
    sb = makeSandbox();
  });
  after(() => sb.cleanup());

  test("aborts on a hazardous push.default", () => {
    sb.git(["config", "push.default", "upstream"]);
    const r = runFi([], sb.work);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /hazardous/);
    sb.git(["config", "push.default", "simple"]);
  });

  test("list aborts when no fi branch exists", () => {
    const r = runFi([], sb.work);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /there is no .*fi.* branch/);
  });
});

describe("non-interactive bootstrap (MG-15)", () => {
  let sb: Sandbox;
  before(() => {
    sb = makeSandbox();
    sb.pushBranch("feature-a", "a.txt", "a\n");
  });
  after(() => sb.cleanup());

  test("aborts (without hanging) when bootstrap is needed and there is no TTY", () => {
    const r = runFi(["--add", "feature-a"], sb.work);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /re-run with --yes/);
    assert.equal(
      sb.git(["for-each-ref", "--format=%(refname)", "refs/remotes/origin/fi"]),
      "",
      "origin/fi must not be created when bootstrap is declined"
    );
  });

  test("--yes bootstraps non-interactively", () => {
    const r = runFi(["--add", "feature-a", "--yes"], sb.work);
    assert.equal(r.status, 0, r.stderr);
    assert.notEqual(
      sb.git(["for-each-ref", "--format=%(refname)", "refs/remotes/origin/fi"]),
      "",
      "origin/fi should exist after --yes bootstrap"
    );
    assert.deepEqual(listedBranches(sb), ["feature-a"]);
  });
});

describe("add / remove / list lifecycle", () => {
  let sb: Sandbox;
  before(() => {
    sb = makeSandbox();
    sb.pushBranch("feature-a", "a.txt", "a\n");
    sb.pushBranch("feature-b", "b.txt", "b\n");
    sb.pushBranch("feature-c", "c.txt", "c\n");
    sb.bootstrapFi();
  });
  after(() => sb.cleanup());

  test("add merges the branch into fi and lists it", () => {
    const r = runFi(["--add", "feature-a"], sb.work);
    assert.equal(r.status, 0, r.stderr);
    assert.notEqual(
      sb.git(["rev-parse", "--verify", "origin/fi"]).length,
      0,
      "origin/fi should exist after add"
    );
    assert.deepEqual(listedBranches(sb), ["feature-a"]);
  });

  test("adding a second branch keeps both, in insertion order", () => {
    const r = runFi(["--add", "feature-b"], sb.work);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(listedBranches(sb), ["feature-a", "feature-b"]);
  });

  test("--json emits the branch list to stdout", () => {
    const r = runFi(["--json"], sb.work);
    assert.equal(r.status, 0, r.stderr);
    const obj = JSON.parse(r.stdout);
    assert.equal(obj.command, "list");
    assert.deepEqual(obj.branches, ["feature-a", "feature-b"]);
  });

  test("remove rebuilds fi without the branch", () => {
    const r = runFi(["--remove", "feature-a"], sb.work);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(listedBranches(sb), ["feature-b"]);
  });

  test("force replaces the entire list", () => {
    const r = runFi(["--force", "feature-c"], sb.work);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(listedBranches(sb), ["feature-c"]);
  });

  test("again re-merges the current set", () => {
    const r = runFi(["--again"], sb.work);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(listedBranches(sb), ["feature-c"]);
  });

  test("add with no argument adds the current branch", () => {
    sb.git(["checkout", "--quiet", "feature-a"]);
    const r = runFi(["--add"], sb.work);
    sb.git(["checkout", "--quiet", "main"]);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(listedBranches(sb).sort(), ["feature-a", "feature-c"]);
  });
});

describe("prune", () => {
  let sb: Sandbox;
  before(() => {
    sb = makeSandbox();
    sb.pushBranch("keep", "keep.txt", "keep\n");
    sb.pushBranch("gone", "gone.txt", "gone\n");
    sb.bootstrapFi();
    runFi(["--add", "keep"], sb.work);
    runFi(["--add", "gone"], sb.work);
  });
  after(() => sb.cleanup());

  test("prune drops a branch that disappeared from origin", () => {
    sb.deleteRemoteBranch("gone");
    const r = runFi(["--prune"], sb.work);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(listedBranches(sb), ["keep"]);
  });
});

describe("conflict detection", () => {
  let sb: Sandbox;
  before(() => {
    sb = makeSandbox();
    sb.pushBranch("left", "shared.txt", "left side\n");
    sb.pushBranch("right", "shared.txt", "right side\n");
    sb.bootstrapFi();
  });
  after(() => sb.cleanup());

  test("a conflicting second branch fails the merge", () => {
    const ok = runFi(["--add", "left"], sb.work);
    assert.equal(ok.status, 0, ok.stderr);

    const bad = runFi(["--add", "right"], sb.work);
    assert.equal(bad.status, 1);
    assert.match(bad.stdout + bad.stderr, /Failed trying to merge/);
  });
});

describe("abort (re-pull)", () => {
  let sb: Sandbox;
  before(() => {
    sb = makeSandbox();
    sb.pushBranch("feature-a", "a.txt", "a\n");
  });
  after(() => sb.cleanup());

  test("abort errors when origin/fi does not exist", () => {
    const r = runFi(["--abort"], sb.work);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /nothing to re-pull/);
  });

  test("abort re-pulls an existing origin/fi", () => {
    sb.bootstrapFi();
    runFi(["--add", "feature-a"], sb.work);
    const r = runFi(["--abort"], sb.work);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /Re-pulled/);
  });
});

describe("CI hint", () => {
  let sb: Sandbox;
  before(() => {
    sb = makeSandbox();
    sb.pushBranch("feature-a", "a.txt", "a\n");
    sb.bootstrapFi();
    runFi(["--add", "feature-a"], sb.work);
  });
  after(() => sb.cleanup());

  test("plain list shows the GITLAB_ACCESS_TOKEN hint", () => {
    const r = runFi([], sb.work);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /GITLAB_ACCESS_TOKEN/);
  });

  test("GIT_FI_NO_HINTS suppresses the hint", () => {
    const r = runFi([], sb.work, { GIT_FI_NO_HINTS: "1" });
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stdout, /GITLAB_ACCESS_TOKEN/);
  });
});
