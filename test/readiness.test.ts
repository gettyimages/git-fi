import { test, beforeEach, afterEach, describe } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { runFi, makeSandbox, type Sandbox } from "./helpers.ts";

/** Merge `branch` into main and push — the branch has landed, fi doesn't know yet. */
function landOnMain(sb: Sandbox, branch: string): void {
  sb.git(["checkout", "--quiet", "main"]);
  sb.git(["merge", "--quiet", "--no-ff", "-m", `merge ${branch}`, branch]);
  sb.git(["push", "--quiet", "origin", "main"]);
}

/** Commit `content` to `file` on main and push, so every branch off the old tip falls behind. */
function advanceMain(sb: Sandbox, file: string, content: string): void {
  sb.git(["checkout", "--quiet", "main"]);
  writeFileSync(join(sb.work, file), content);
  sb.git(["add", "."]);
  sb.git(["commit", "--quiet", "-m", `main: ${file}`]);
  sb.git(["push", "--quiet", "origin", "main"]);
}

describe("behind counts (READY-01, READY-02)", () => {
  let sb: Sandbox;
  beforeEach(() => {
    sb = makeSandbox();
  });
  afterEach(() => sb.cleanup());

  test("a branch level with main carries no marker", () => {
    sb.pushBranch("feature-a", "a.txt", "a\n");
    sb.bootstrapFi();
    assert.equal(runFi(["--add", "feature-a"], sb.work).status, 0);

    const r = runFi([], sb.work, { GIT_FI_NO_HINTS: "1" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /feature-a/);
    assert.doesNotMatch(r.stdout, /behind/);
  });

  test("a branch trailing main is marked with the commit count", () => {
    sb.pushBranch("feature-a", "a.txt", "a\n");
    sb.bootstrapFi();
    assert.equal(runFi(["--add", "feature-a"], sb.work).status, 0);

    advanceMain(sb, "m1.txt", "one\n");
    advanceMain(sb, "m2.txt", "two\n");

    // NO_COLOR is set by the harness, so TERM-10's worded form is what renders.
    const r = runFi([], sb.work, { GIT_FI_NO_HINTS: "1" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /feature-a behind 2/);
  });

  test("--json carries the counts on the branch itself", () => {
    sb.pushBranch("feature-a", "a.txt", "a\n");
    sb.bootstrapFi();
    assert.equal(runFi(["--add", "feature-a"], sb.work).status, 0);
    advanceMain(sb, "m1.txt", "one\n");
    sb.pushBranch("feature-b", "b.txt", "b\n");
    assert.equal(runFi(["--add", "feature-b"], sb.work).status, 0);

    const r = runFi(["--json"], sb.work);
    assert.equal(r.status, 0, r.stderr);
    const byName = new Map(
      JSON.parse(r.stdout).branches.map((b: { name: string }) => [b.name, b])
    );
    assert.equal((byName.get("feature-a") as { behind: number }).behind, 1);
    assert.equal((byName.get("feature-b") as { behind: number }).behind, 0);
    assert.equal((byName.get("feature-a") as { ahead: number }).ahead, 1);
  });

  test("--bare stays branch names only (LIST-02)", () => {
    sb.pushBranch("feature-a", "a.txt", "a\n");
    sb.bootstrapFi();
    assert.equal(runFi(["--add", "feature-a"], sb.work).status, 0);
    advanceMain(sb, "m1.txt", "one\n");

    const r = runFi(["--bare"], sb.work);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), "feature-a");
  });
});

describe("already-merged branches (READY-07)", () => {
  let sb: Sandbox;
  beforeEach(() => {
    sb = makeSandbox();
  });
  afterEach(() => sb.cleanup());

  /** Add a branch to fi, then land it on main behind fi's back. */
  function addThenLand(branch: string, file: string): void {
    sb.pushBranch(branch, file, `${branch}\n`);
    assert.equal(runFi(["--add", branch], sb.work).status, 0);
    landOnMain(sb, branch);
  }

  test("a landed branch is marked merged, not behind", () => {
    sb.bootstrapFi();
    addThenLand("feature-a", "a.txt");

    const r = runFi([], sb.work, { GIT_FI_NO_HINTS: "1" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /feature-a merged/);
    assert.doesNotMatch(r.stdout, /behind/);
  });

  test("--json flags it merged, with nothing ahead", () => {
    // Both branches enter fi in one mutation, and feature-a lands afterwards:
    // any further mutation would prune it (MERGE-07) before the list saw it.
    sb.pushBranch("feature-a", "a.txt", "a\n");
    sb.pushBranch("feature-b", "b.txt", "b\n");
    sb.bootstrapFi();
    assert.equal(runFi(["--add", "feature-a", "feature-b"], sb.work).status, 0);
    landOnMain(sb, "feature-a");

    const r = runFi(["--json"], sb.work);
    assert.equal(r.status, 0, r.stderr);
    const byName = new Map(
      JSON.parse(r.stdout).branches.map(
        (b: { name: string }) => [b.name, b] as const
      )
    );
    const a = byName.get("feature-a") as { merged: boolean; ahead: number };
    const b = byName.get("feature-b") as { merged: boolean };
    assert.equal(a.merged, true);
    assert.equal(a.ahead, 0);
    assert.equal(b.merged, false);
  });

  test("--again prunes it, so the marker is transient (MERGE-07)", () => {
    sb.bootstrapFi();
    addThenLand("feature-a", "a.txt");

    const again = runFi(["--again"], sb.work);
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stderr, /feature-a already in main/);
    assert.equal(runFi(["--bare"], sb.work).stdout.trim(), "");
  });

  test("a live branch is not marked merged", () => {
    sb.pushBranch("feature-a", "a.txt", "a\n");
    sb.bootstrapFi();
    assert.equal(runFi(["--add", "feature-a"], sb.work).status, 0);
    advanceMain(sb, "m1.txt", "one\n");

    const r = runFi([], sb.work, { GIT_FI_NO_HINTS: "1" });
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stdout, /merged/);
    assert.match(r.stdout, /feature-a behind 1/);
  });
});

describe("conflict attribution (READY-03, READY-04, READY-05)", () => {
  let sb: Sandbox;
  beforeEach(() => {
    sb = makeSandbox();
  });
  afterEach(() => sb.cleanup());

  test("a branch conflicting with main is told to rebase", () => {
    sb.pushBranch("feature-a", "shared.txt", "from-a\n");
    sb.bootstrapFi();
    advanceMain(sb, "shared.txt", "from-main\n");

    const r = runFi(["--add", "feature-a"], sb.work);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /feature-a \(\S+\)\s+conflicts with main/);
    assert.match(r.stdout, /shared\.txt/);
    assert.match(
      r.stdout,
      /git checkout feature-a && git rebase origin\/main && git push --force-with-lease/
    );
  });

  test("branches conflicting with each other name the peer, not main", () => {
    sb.pushBranch("feature-a", "shared.txt", "from-a\n");
    sb.pushBranch("feature-b", "shared.txt", "from-b\n");
    sb.bootstrapFi();
    assert.equal(runFi(["--add", "feature-a"], sb.work).status, 0);

    const r = runFi(["--add", "feature-b"], sb.work);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /feature-b \(\S+\)\s+conflicts with feature-a/);
    assert.doesNotMatch(r.stdout, /conflicts with main/);
    assert.match(r.stdout, /rebase feature-b onto feature-a/);
  });

  test("each branch named carries the author who owns its rebase (READY-04)", () => {
    sb.pushBranch("feature-a", "shared.txt", "from-a\n");
    sb.pushBranch("feature-b", "shared.txt", "from-b\n");
    sb.bootstrapFi();
    assert.equal(runFi(["--add", "feature-a"], sb.work).status, 0);

    const r = runFi(["--add", "feature-b"], sb.work);
    assert.equal(r.status, 1, r.stdout);
    // The sandbox commits as test@example.com, so both sides report it.
    assert.match(r.stdout, /feature-b \(test@example\.com\)/);
    assert.match(r.stdout, /conflicts with feature-a \(test@example\.com\)/);
  });

  test("main is named bare — it is nobody's to rebase (READY-04)", () => {
    sb.pushBranch("feature-a", "shared.txt", "from-a\n");
    sb.bootstrapFi();
    advanceMain(sb, "shared.txt", "from-main\n");

    const r = runFi(["--add", "feature-a"], sb.work);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /conflicts with main$/m);
  });

  test("the report closes with a temporary --remove line for a branch fi holds (READY-04)", () => {
    sb.pushBranch("feature-a", "shared.txt", "from-a\n");
    sb.bootstrapFi();
    assert.equal(runFi(["--add", "feature-a"], sb.work).status, 0);
    // main moves under a branch fi already carries, so the re-merge fails on a
    // branch that -r can actually take back out.
    advanceMain(sb, "shared.txt", "from-main\n");

    const r = runFi(["--again"], sb.work);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /temporarily remove them from fi/);
    assert.match(r.stdout, /git fi -r feature-a/);
  });

  test("a branch that failed on the way in gets no --remove line (READY-04)", () => {
    sb.pushBranch("feature-a", "shared.txt", "from-a\n");
    sb.pushBranch("feature-b", "shared.txt", "from-b\n");
    sb.bootstrapFi();
    assert.equal(runFi(["--add", "feature-a"], sb.work).status, 0);

    // feature-b never entered fi, so there is nothing for -r to remove and
    // offering it would send the reader to a command that changes nothing.
    const r = runFi(["--add", "feature-b"], sb.work);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /conflicts with feature-a/);
    assert.doesNotMatch(r.stdout, /temporarily remove them from fi/);
    assert.doesNotMatch(r.stdout, /git fi -r/);
  });

  test("the remedy never suggests --force (READY-04)", () => {
    sb.pushBranch("feature-a", "shared.txt", "from-a\n");
    sb.pushBranch("feature-b", "shared.txt", "from-b\n");
    sb.bootstrapFi();
    assert.equal(runFi(["--add", "feature-a"], sb.work).status, 0);

    const r = runFi(["--add", "feature-b"], sb.work);
    assert.equal(r.status, 1, r.stdout);
    assert.doesNotMatch(r.stdout + r.stderr, /--force\b/);
  });

  test("a clean branch merged before the conflict is not blamed", () => {
    sb.pushBranch("clean-one", "one.txt", "one\n");
    sb.pushBranch("feature-a", "shared.txt", "from-a\n");
    sb.pushBranch("feature-b", "shared.txt", "from-b\n");
    sb.bootstrapFi();
    assert.equal(runFi(["--add", "clean-one", "feature-a"], sb.work).status, 0);

    const r = runFi(["--add", "feature-b"], sb.work);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /conflicts with feature-a/);
    assert.doesNotMatch(r.stdout, /conflicts with clean-one/);
  });

  test("--json writes the conflicts object and still exits non-zero (JSON-03)", () => {
    sb.pushBranch("feature-a", "shared.txt", "from-a\n");
    sb.pushBranch("feature-b", "shared.txt", "from-b\n");
    sb.bootstrapFi();
    assert.equal(runFi(["--add", "feature-a"], sb.work).status, 0);

    const r = runFi(["--add", "feature-b", "--json"], sb.work);
    assert.equal(r.status, 1, r.stderr);
    const obj = JSON.parse(r.stdout);
    assert.equal(obj.command, "add");
    assert.deepEqual(obj.conflicts, [
      { branch: "feature-b", with: ["feature-a"], paths: ["shared.txt"] },
    ]);
    // Nothing was pushed, so `branches` is fi as it still stands — the same
    // thing it means after an action that succeeded. `attempted` is the set
    // that was tried.
    assert.deepEqual(
      obj.branches.map((b: { name: string; ci: unknown }) => [b.name, b.ci]),
      [["feature-a", null]]
    );
    assert.deepEqual(obj.attempted, ["feature-a", "feature-b"]);
  });

  test("a branch name a shell would read is quoted in the remedy (READY-04)", () => {
    // git accepts backticks, `;`, `&&` and `|` in a ref name, and the remedy is
    // a line the report invites someone to paste. Unquoted, adding the branch
    // puts a command substitution in front of every teammate whose next merge
    // fails.
    const hostile = "feat`id`x";
    sb.pushBranch(hostile, "shared.txt", "from-hostile\n");
    sb.bootstrapFi();
    advanceMain(sb, "shared.txt", "from-main\n");

    const r = runFi(["--add", hostile], sb.work);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /git checkout 'feat`id`x'/);
    assert.doesNotMatch(r.stdout, /git checkout feat`/);
  });

  test("a conflicted path keeps its bytes rather than arriving C-quoted", () => {
    const path = "spaced ünïcode.txt";
    sb.pushBranch("uni-a", path, "from-a\n");
    sb.pushBranch("uni-b", path, "from-b\n");
    sb.bootstrapFi();
    assert.equal(runFi(["--add", "uni-a"], sb.work).status, 0);

    const r = runFi(["--add", "uni-b", "--json"], sb.work);
    assert.equal(r.status, 1, r.stderr);
    // merge-tree C-quotes by default, which yields a string matching no path
    // on disk — the field a pipeline is told to act on.
    assert.deepEqual(JSON.parse(r.stdout).conflicts[0].paths, [path]);
    assert.match(r.stdout, /spaced ünïcode\.txt/);
  });

  test("a combination-only failure says so rather than naming nobody", () => {
    // The combined merge is git's octopus strategy, which has no rename
    // detection; the replay is ort, which has. A rename against a concurrent
    // edit therefore fails the merge and comes back clean from every probe.
    const lines = Array.from({ length: 200 }, (_, i) => `${i}\n`).join("");
    writeFileSync(join(sb.work, "big.txt"), lines);
    sb.git(["add", "."]);
    sb.git(["commit", "--quiet", "-m", "big"]);
    sb.git(["push", "--quiet", "origin", "main"]);

    sb.git(["checkout", "--quiet", "-b", "renamer", "main"]);
    sb.git(["mv", "big.txt", "renamed.txt"]);
    sb.git(["commit", "--quiet", "-m", "rename"]);
    sb.git(["push", "--quiet", "origin", "renamer"]);

    sb.git(["checkout", "--quiet", "-b", "editor", "main"]);
    writeFileSync(join(sb.work, "big.txt"), lines + "201\n");
    sb.git(["add", "."]);
    sb.git(["commit", "--quiet", "-m", "edit"]);
    sb.git(["push", "--quiet", "origin", "editor"]);
    sb.git(["checkout", "--quiet", "main"]);
    sb.bootstrapFi();

    const r = runFi(["--add", "renamer", "editor"], sb.work);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /the conflict is in the combination/);
    assert.match(r.stdout, /octopus/);
  });

  test("the working tree is left clean and on the original branch (READY-06)", () => {
    sb.pushBranch("feature-a", "shared.txt", "from-a\n");
    sb.bootstrapFi();
    advanceMain(sb, "shared.txt", "from-main\n");
    sb.git(["checkout", "--quiet", "-b", "scratch", "main"]);

    assert.equal(runFi(["--add", "feature-a"], sb.work).status, 1);
    assert.equal(sb.git(["status", "--porcelain"]), "");
    assert.equal(sb.git(["symbolic-ref", "--short", "HEAD"]), "scratch");
  });
});
