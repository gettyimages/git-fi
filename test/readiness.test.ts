import { test, beforeEach, afterEach, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runFi, makeSandbox, type Sandbox } from "./helpers.ts";

/** Merge `branch` into main and push — the branch has landed, fi doesn't know yet. */
function landOnMain(sb: Sandbox, branch: string): void {
  sb.git(["checkout", "--quiet", "main"]);
  sb.git(["merge", "--quiet", "--no-ff", "-m", `merge ${branch}`, branch]);
  sb.git(["push", "--quiet", "origin", "main"]);
}

/** Push a branch whose tip is a teammate's commit rather than the sandbox user's. */
function pushBranchAs(
  sb: Sandbox,
  branch: string,
  file: string,
  content: string,
  author: string
): void {
  sb.git(["checkout", "--quiet", "-b", branch, "main"]);
  writeFileSync(join(sb.work, file), content);
  sb.git(["add", "."]);
  sb.git(["commit", "--quiet", `--author=${author}`, "-m", `${branch}: ${file}`]);
  sb.git(["push", "--quiet", "origin", branch]);
  sb.git(["checkout", "--quiet", "main"]);
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

  test("a branch of your own conflicting with main prints the rebase to run", () => {
    sb.pushBranch("feature-a", "shared.txt", "from-a\n");
    sb.bootstrapFi();
    advanceMain(sb, "shared.txt", "from-main\n");

    const r = runFi(["--add", "feature-a"], sb.work);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /feature-a \(\S+\)\s+conflicts with main/);
    assert.match(r.stdout, /shared\.txt/);
    assert.match(
      r.stdout,
      /1\. git checkout feature-a && git pull && git rebase origin\/main\n\s+2\. resolve the conflict, then git rebase --continue\n\s+3\. git push --force-with-lease/
    );
    // Nobody else owns it, so there is no one to message.
    assert.doesNotMatch(r.stdout, /Message /);
  });

  test("a teammate's branch conflicting with main comes with a message for them (READY-04)", () => {
    pushBranchAs(sb, "feature-a", "shared.txt", "from-a\n", "Alice Ng <alice@example.com>");
    sb.bootstrapFi();
    advanceMain(sb, "shared.txt", "from-main\n");

    const r = runFi(["--add", "feature-a"], sb.work);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /Message Alice Ng <alice@example\.com>:/);
    assert.match(r.stdout, /hey Alice, feature-a couldn't merge into fi; main changed the same lines in shared\.txt:/);
    assert.match(r.stdout, />>>>>>> origin\/feature-a\n {7}To fix:\n/);
    assert.match(
      r.stdout,
      /^ {7}1\. git checkout feature-a && git pull && git rebase origin\/main\n {7}2\. resolve the conflict, then git rebase --continue\n {7}3\. git push --force-with-lease$/m
    );
  });

  test("a peer conflict is the failing branch owner's to fix, with the hunk (READY-04)", () => {
    pushBranchAs(sb, "feature-a", "shared.txt", "from-a\n", "Alice Ng <alice@example.com>");
    pushBranchAs(sb, "feature-b", "shared.txt", "from-b\n", "Bob Li <bob@example.com>");
    sb.bootstrapFi();
    assert.equal(runFi(["--add", "feature-a"], sb.work).status, 0);

    const r = runFi(["--add", "feature-b"], sb.work);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /feature-b \(\S+\)\s+conflicts with feature-a/);
    assert.doesNotMatch(r.stdout, /conflicts with main/);
    // feature-a was in first, so feature-b's owner carries the fix; Alice is named, not messaged.
    assert.match(r.stdout, /Message Bob Li <bob@example\.com>:/);
    assert.doesNotMatch(r.stdout, /Message .*alice@example\.com/);
    assert.match(
      r.stdout,
      /hey Bob, feature-b couldn't merge into fi: feature-a \(Alice Ng\) already changes shared\.txt/
    );
    // diff3: both sides and the base between them, under the names the reader knows.
    assert.match(r.stdout, /<<<<<<< origin\/feature-a\n\s+from-a\n\s+\|{7} \w+\n\s+=======\n\s+from-b\n\s+>>>>>>> origin\/feature-b/);
    assert.match(
      r.stdout,
      /To fix: talk to Alice about how the two changes should fit together\./
    );
  });

  test("a peer conflict on your own branch is a heads-up to the other author (READY-04)", () => {
    pushBranchAs(sb, "feature-a", "shared.txt", "from-a\n", "Alice Ng <alice@example.com>");
    sb.pushBranch("feature-b", "shared.txt", "from-b\n");
    sb.bootstrapFi();
    assert.equal(runFi(["--add", "feature-a"], sb.work).status, 0);

    const r = runFi(["--add", "feature-b"], sb.work);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /Message Alice Ng <alice@example\.com>:/);
    assert.match(r.stdout, /hey Alice, heads-up: my feature-b overlaps your feature-a in shared\.txt on fi:/);
    assert.match(r.stdout, /I'll adjust mine\. Anything in flight on that file I should know about\?/);
  });

  test("a hunk's control bytes are stripped before they reach the terminal (READY-04)", () => {
    sb.pushBranch("feature-a", "shared.txt", "from-a\x1b[2K\n");
    sb.bootstrapFi();
    advanceMain(sb, "shared.txt", "from-main\n");

    const r = runFi(["--add", "feature-a"], sb.work);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /^\s+from-a\[2K$/m);
    assert.doesNotMatch(r.stdout, /\x1b/);
  });

  test("the conflicts that one conversation clears lead the output (READY-04)", () => {
    pushBranchAs(sb, "hub", "shared.txt", "from-hub\n", "Cara Diaz <cara@example.com>");
    sb.pushBranch("stale", "main-file.txt", "from-stale\n");
    sb.pushBranch("feature-b", "shared.txt", "from-b\n");
    sb.pushBranch("feature-c", "shared.txt", "from-c\n");
    sb.bootstrapFi();
    assert.equal(runFi(["--add", "hub"], sb.work).status, 0);
    advanceMain(sb, "main-file.txt", "from-main\n");

    // stale fails first in merge order, against main; b and c both collide with hub.
    const r = runFi(["--add", "stale", "feature-b", "feature-c"], sb.work);
    assert.equal(r.status, 1, r.stdout);
    const order = [...r.stdout.matchAll(/^ \* (\S+) .*conflicts with/gm)].map((m) => m[1]);
    assert.deepEqual(order, ["feature-b", "feature-c", "stale"]);
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

  test("a separator byte in the tip author's email still names the author (READY-04)", () => {
    sb.pushBranch("feature-a", "shared.txt", "from-a\n");
    // git takes a control character in an author email and the format atom
    // emits it verbatim, so feature-a's listing line carries a sixth field.
    sb.git(["checkout", "--quiet", "feature-a"]);
    sb.git([
      "commit",
      "--quiet",
      "--amend",
      "--no-edit",
      "--author=Evil <ev\x1fil@example.com>",
    ]);
    sb.git(["push", "--quiet", "--force", "origin", "feature-a"]);
    sb.git(["checkout", "--quiet", "main"]);
    sb.pushBranch("feature-b", "shared.txt", "from-b\n");
    sb.bootstrapFi();
    assert.equal(runFi(["--add", "feature-a"], sb.work).status, 0);

    const r = runFi(["--add", "feature-b"], sb.work);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /conflicts with feature-a \(evil@example\.com\)/);
  });

  test("main is named bare — it is nobody's to rebase (READY-04)", () => {
    sb.pushBranch("feature-a", "shared.txt", "from-a\n");
    sb.bootstrapFi();
    advanceMain(sb, "shared.txt", "from-main\n");

    const r = runFi(["--add", "feature-a"], sb.work);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /conflicts with main$/m);
  });

  test("the output closes with the --remove line that gets fi building again (READY-04)", () => {
    sb.pushBranch("feature-a", "shared.txt", "from-a\n");
    sb.bootstrapFi();
    assert.equal(runFi(["--add", "feature-a"], sb.work).status, 0);
    // main moves under a branch fi already carries, so the re-merge fails on a
    // branch that -r can actually take back out.
    advanceMain(sb, "shared.txt", "from-main\n");

    const r = runFi(["--again"], sb.work);
    assert.equal(r.status, 1, r.stdout);
    assert.match(
      r.stdout,
      /\n─+\nTo get fi building again now, take the failing branches out:\n {2}git fi -r feature-a\n/
    );
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
    assert.doesNotMatch(r.stdout, /get fi building again/);
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
      {
        branch: "feature-b",
        author: { name: "Test", email: "test@example.com" },
        with: ["feature-a"],
        paths: ["shared.txt"],
      },
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

  // The object is carried past the buffer by deep paths, which Windows refuses
  // past MAX_PATH; reaching the threshold with short ones takes enough files to
  // cost more than the coverage is worth. Nothing in the buffering is
  // platform-specific, so the other two jobs cover it.
  test(
    "--json survives a failure object wider than the pipe buffer (JSON-03)",
    { skip: process.platform === "win32" },
    () => {
      // `runFi` reads stdout through a pipe, which is where the object is read
      // in anger. `paths` is uncapped, so a conflict across enough files carries
      // the object past the 64K buffer, and any tail still in node's own buffer
      // is dropped by the exit unless the write is waited on. The paths are deep
      // rather than numerous so the threshold is reached with a repo git can
      // build quickly.
      const segment = "a_directory_segment_of_some_length";
      const deep = Array.from(
        { length: 175 },
        (_, i) => `${Array(12).fill(segment).join("/")}/file_${i}.ts`
      );
      const write = (branch: string, content: string) => {
        sb.git(["checkout", "--quiet", "-b", branch, "main"]);
        for (const p of deep) {
          mkdirSync(join(sb.work, p, ".."), { recursive: true });
          writeFileSync(join(sb.work, p), content);
        }
        sb.git(["add", "-A"]);
        sb.git(["commit", "--quiet", "-m", branch]);
        sb.git(["push", "--quiet", "origin", branch]);
        sb.git(["checkout", "--quiet", "main"]);
      };
      write("wide-a", "from-a\n");
      write("wide-b", "from-b\n");
      sb.bootstrapFi();
      assert.equal(runFi(["--add", "wide-a"], sb.work).status, 0);

      const r = runFi(["--add", "wide-b", "--json"], sb.work);
      assert.equal(r.status, 1, r.stderr);
      assert.ok(
        r.stdout.length > 65536,
        `object must exceed the pipe buffer to exercise this; got ${r.stdout.length}`
      );
      const obj = JSON.parse(r.stdout);
      assert.equal(obj.conflicts[0].paths.length, deep.length);
    }
  );

  test("--debug lets git's own stderr through (OPTION-11)", () => {
    // An orphan branch shares no history, so `merge-tree` exits 128 with a
    // reason on stderr. The failure report points at --debug for that reason,
    // so it has to arrive rather than landing in a buffer nothing reads.
    sb.pushBranch("edit-br", "shared.txt", "from-edit\n");
    sb.git(["checkout", "--quiet", "--orphan", "orphan-br"]);
    sb.git(["rm", "--quiet", "-rf", "."]);
    writeFileSync(join(sb.work, "unrelated.txt"), "unrelated\n");
    sb.git(["add", "-A"]);
    sb.git(["commit", "--quiet", "-m", "orphan"]);
    sb.git(["push", "--quiet", "origin", "orphan-br"]);
    sb.git(["checkout", "--quiet", "main"]);
    sb.bootstrapFi();

    const r = runFi(["--add", "orphan-br", "edit-br", "--debug"], sb.work);
    assert.match(r.stderr, /refusing to merge unrelated histories/);
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

  test("the --remove line quotes such a name as well (READY-04)", () => {
    // The second command line the report prints, built at its own call site:
    // a name quoted in the rebase remedy can still go bare here.
    const hostile = "feat`id`x";
    sb.pushBranch(hostile, "shared.txt", "from-hostile\n");
    sb.bootstrapFi();
    assert.equal(runFi(["--add", hostile], sb.work).status, 0);
    advanceMain(sb, "shared.txt", "from-main\n");

    const r = runFi(["--again"], sb.work);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /git fi -r 'feat`id`x'/);
    assert.doesNotMatch(r.stdout, /git fi -r feat`/);
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

  test("a rename against a concurrent edit merges cleanly", () => {
    // git's octopus strategy has no rename detection, so this pair used to fail
    // the merge and then come back clean from every probe, a failure the report
    // could only describe as living in the combination. merge-tree is ort, which
    // detects the rename and carries the edit across it.
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
    assert.equal(r.status, 0, r.stdout + r.stderr);

    // The rename wins the path and the edit rides along on it, which is the
    // resolution the failure used to stand in for.
    sb.git(["fetch", "--quiet", "origin"]);
    const merged = sb.git(["show", "origin/fi:renamed.txt"]);
    assert.equal(merged, lines + "201");
    assert.equal(
      sb.git(["ls-tree", "--name-only", "origin/fi", "big.txt"]),
      ""
    );
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

  test("a failed merge leaves no file for the report to name (MERGE-11)", () => {
    // The branch that conflicts also adds a file of its own. A merge that ran in
    // the checkout wrote that file before hitting the conflict, and `reset
    // --hard` does not remove an untracked one, which is what the report used
    // to hand the reader `rm` commands for.
    sb.git(["checkout", "--quiet", "-b", "feature-a", "main"]);
    writeFileSync(join(sb.work, "shared.txt"), "from-a\n");
    writeFileSync(join(sb.work, "brought-along.txt"), "a\n");
    sb.git(["add", "."]);
    sb.git(["commit", "--quiet", "-m", "feature-a"]);
    sb.git(["push", "--quiet", "origin", "feature-a"]);
    sb.git(["checkout", "--quiet", "main"]);
    sb.bootstrapFi();
    advanceMain(sb, "shared.txt", "from-main\n");

    const r = runFi(["--add", "feature-a"], sb.work);
    assert.equal(r.status, 1, r.stdout);
    assert.doesNotMatch(r.stdout, /untracked/);
    assert.equal(sb.git(["status", "--porcelain"]), "");
  });
});

describe("local drift from the merged ref (READY-08)", () => {
  let sb: Sandbox;
  beforeEach(() => {
    sb = makeSandbox();
    sb.pushBranch("feature-a", "a.txt", "a\n");
    sb.bootstrapFi();
  });
  afterEach(() => sb.cleanup());

  /** Commit on `branch` without pushing, so the local branch runs ahead. */
  function commitLocally(branch: string, file: string, content: string): void {
    sb.git(["checkout", "--quiet", branch]);
    writeFileSync(join(sb.work, file), content);
    sb.git(["add", "."]);
    sb.git(["commit", "--quiet", "-m", `${branch}: ${file}`]);
    sb.git(["checkout", "--quiet", "main"]);
  }

  /**
   * Push two commits, then rewind the local branch off both, so it runs behind
   * by a count that cannot be confused with the ahead count below.
   */
  function fallBehind(branch: string, file: string, content: string): void {
    commitLocally(branch, file, content);
    commitLocally(branch, `${file}.2`, content);
    sb.git(["push", "--quiet", "origin", branch]);
    sb.git(["checkout", "--quiet", branch]);
    sb.git(["reset", "--quiet", "--hard", "HEAD~2"]);
    sb.git(["checkout", "--quiet", "main"]);
  }

  test("an unpushed commit is named, since fi cannot carry it", () => {
    commitLocally("feature-a", "later.txt", "not pushed\n");
    const r = runFi(["--add", "feature-a"], sb.work);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /fi merges origin\/feature-a, and your feature-a is 1 ahead/);
  });

  test("a stale local branch is named, since fi carries more than it", () => {
    fallBehind("feature-a", "later.txt", "pushed\n");
    const r = runFi(["--add", "feature-a"], sb.work);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /fi merges origin\/feature-a, and your feature-a is 2 behind/);
  });

  test("a diverged branch carries both counts", () => {
    fallBehind("feature-a", "theirs.txt", "pushed\n");
    commitLocally("feature-a", "mine.txt", "not pushed\n");
    const r = runFi(["--add", "feature-a"], sb.work);
    assert.equal(r.status, 0, r.stderr);
    assert.match(
      r.stderr,
      /fi merges origin\/feature-a, and your feature-a is 1 ahead, 2 behind/
    );
  });

  test("a branch level with its remote says nothing", () => {
    const r = runFi(["--add", "feature-a"], sb.work);
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stderr, /fi merges origin/);
  });

  test("a branch with no local copy says nothing", () => {
    // The usual case for a teammate's branch: nothing local to have drifted.
    sb.pushBranch("feature-b", "b.txt", "b\n");
    sb.git(["branch", "--quiet", "-D", "feature-b"]);
    const r = runFi(["--add", "feature-b"], sb.work);
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stderr, /fi merges origin/);
  });

  test("--again stays quiet about branches it did not name", () => {
    // Re-merging the set is not a statement about any one branch, so a stale
    // local copy of someone else's is noise rather than a signal.
    assert.equal(runFi(["--add", "feature-a"], sb.work).status, 0);
    commitLocally("feature-a", "later.txt", "not pushed\n");

    const r = runFi(["--again"], sb.work);
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stderr, /fi merges origin/);
  });

  test("a branch sharing no history with its remote says nothing", () => {
    // `rev-list --left-right --count` answers a disjoint pair with the size of
    // each side rather than failing, so without the merge-base probe every
    // commit on both branches reads as drift.
    sb.git(["checkout", "--quiet", "--orphan", "rebuilt"]);
    sb.git(["rm", "--quiet", "-rf", "."]);
    writeFileSync(join(sb.work, "fresh.txt"), "fresh\n");
    sb.git(["add", "."]);
    sb.git(["commit", "--quiet", "-m", "rebuilt from nothing"]);
    sb.git(["branch", "--quiet", "-M", "feature-a"]);
    sb.git(["checkout", "--quiet", "main"]);

    const r = runFi(["--add", "feature-a"], sb.work);
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stderr, /fi merges origin/);
  });

  test("a tag sharing the branch's name does not stand in for it", () => {
    // git resolves refs/tags/ before refs/heads/, so a bare name would measure
    // the tag and report drift the branch does not have.
    commitLocally("feature-a", "later.txt", "not pushed\n");
    sb.git(["tag", "feature-a", "origin/feature-a"]);

    const r = runFi(["--add", "feature-a"], sb.work);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /fi merges origin\/feature-a, and your feature-a is 1 ahead/);
  });
});

// `git symbolic-ref` reads the symref file without looking at what it names, so
// origin/HEAD outlives the branch it points at. Both states below reach
// listRemoteBranches with a default-branch name that resolves to nothing, where
// `%(ahead-behind:)` is fatal rather than empty — so the listing has to check
// the ref rather than trust where the name came from.
describe("a default branch whose ref does not resolve", () => {
  let sb: Sandbox;
  beforeEach(() => {
    sb = makeSandbox();
  });
  afterEach(() => sb.cleanup());

  test("still lists branches when origin/HEAD dangles after a rename", () => {
    sb.pushBranch("feature-a", "a.txt", "a\n");
    sb.bootstrapFi();
    assert.equal(runFi(["--add", "feature-a"], sb.work).status, 0);

    // The default-branch rename: push main under a new name, move origin's own
    // HEAD across so the old branch can go, then drop and prune it. The local
    // origin/HEAD is left naming a ref nobody has.
    sb.git(["push", "--quiet", "origin", "main:trunk"]);
    sb.git(["-C", sb.origin, "symbolic-ref", "HEAD", "refs/heads/trunk"]);
    sb.git(["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
    sb.deleteRemoteBranch("main");
    sb.git(["fetch", "--quiet", "--prune", "origin"]);
    assert.equal(sb.git(["symbolic-ref", "refs/remotes/origin/HEAD"]), "refs/remotes/origin/main");

    const r = runFi([], sb.work, { GIT_FI_NO_HINTS: "1" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /feature-a/);
  });

  test("still lists branches when the default branch name carries a slash", () => {
    // `basename` truncates refs/remotes/origin/release/main to `main`, so the
    // name reached here is one nobody has — the same unresolvable ref by a
    // different route, and it needs origin/main gone to be the real thing.
    sb.pushBranch("feature-a", "a.txt", "a\n");
    sb.bootstrapFi();
    assert.equal(runFi(["--add", "feature-a"], sb.work).status, 0);

    sb.git(["push", "--quiet", "origin", "main:release/main"]);
    sb.git(["-C", sb.origin, "symbolic-ref", "HEAD", "refs/heads/release/main"]);
    sb.deleteRemoteBranch("main");
    sb.git(["fetch", "--quiet", "--prune", "origin"]);
    sb.git([
      "symbolic-ref",
      "refs/remotes/origin/HEAD",
      "refs/remotes/origin/release/main",
    ]);
    assert.doesNotMatch(sb.git(["branch", "-r"]), /origin\/main$/m);

    const r = runFi([], sb.work, { GIT_FI_NO_HINTS: "1" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /feature-a/);
  });
});
