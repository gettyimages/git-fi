import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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

  test("--select cannot be combined with --json or --bare (OPT-09)", () => {
    for (const fmt of ["--json", "--bare"]) {
      const r = runFi(["--select", "--add", fmt], dir);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /--select cannot be combined with/);
      assert.ok(r.stderr.includes(fmt), `error should name ${fmt}`);
    }
  });

  test("--help lists the install-completions command", () => {
    const r = runFi(["--help"], dir);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /install-completions <bash\|zsh>/);
  });

  test("install-completions bash prints the bash script (CMP-04)", () => {
    const r = runFi(["install-completions", "bash"], dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /_git_fi \(\) \{/);
  });

  test("install-completions zsh prints the zsh script (CMP-04)", () => {
    const r = runFi(["install-completions", "zsh"], dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /#compdef git-fi/);
  });

  test("install-completions detects the shell from $SHELL", () => {
    const r = runFi(["install-completions"], dir, { SHELL: "/bin/bash" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /_git_fi \(\) \{/);
  });

  test("install-completions aborts on an unsupported shell", () => {
    const r = runFi(["install-completions"], dir, { SHELL: "/usr/bin/fish" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /install-completions <bash\|zsh>/);
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

describe("commit message format (BL-01..BL-04)", () => {
  const fiMessage = (sb: Sandbox) =>
    sb.git(["log", "-1", "--format=%B", "origin/fi"]);

  test("always writes the legacy format during the rollout (BL-04)", () => {
    const sb = makeSandbox();
    try {
      sb.pushBranch("feature-a", "a.txt", "a\n");
      sb.pushBranch("feature-b", "b.txt", "b\n");

      // Fresh bootstrap → legacy.
      const r = runFi(["--add", "feature-a", "--yes"], sb.work);
      assert.equal(r.status, 0, r.stderr);
      assert.match(
        fiMessage(sb),
        /Merge remote-tracking branch.*'origin\/feature-a'.*into fi/
      );
      assert.deepEqual(listedBranches(sb), ["feature-a"]);

      // A subsequent op stays legacy and still round-trips.
      const r2 = runFi(["--add", "feature-b"], sb.work);
      assert.equal(r2.status, 0, r2.stderr);
      assert.match(fiMessage(sb), /Merge remote-tracking branches .*into fi/);
      assert.deepEqual(listedBranches(sb), ["feature-a", "feature-b"]);
    } finally {
      sb.cleanup();
    }
  });

  test("reads a terse-format fi; writes stay legacy, not terse (BL-02/BL-04)", () => {
    const sb = makeSandbox();
    try {
      sb.pushBranch("feature-a", "a.txt", "a\n");
      sb.pushBranch("feature-b", "b.txt", "b\n");

      // Seed origin/fi with a terse message, as an older git-fi would write.
      const base = sb.git(["rev-parse", "--short", "origin/main"]);
      sb.git(["checkout", "--quiet", "-B", "fi", "origin/main"]);
      sb.git(["commit", "--allow-empty", "--quiet", "-m", `(feature-a)@[${base}]`]);
      sb.git(["push", "--quiet", "-f", "origin", "fi"]);
      sb.git(["checkout", "--quiet", "main"]);
      sb.git(["fetch", "--quiet", "origin"]);

      // git-fi reads the terse branch list.
      assert.deepEqual(listedBranches(sb), ["feature-a"]);

      // But a write does NOT continue terse — it rewrites in legacy.
      const r = runFi(["--add", "feature-b"], sb.work);
      assert.equal(r.status, 0, r.stderr);
      assert.match(fiMessage(sb), /Merge remote-tracking branches .*into fi/);
      assert.deepEqual(listedBranches(sb), ["feature-a", "feature-b"]);
    } finally {
      sb.cleanup();
    }
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

describe("pruning via --again", () => {
  let sb: Sandbox;
  before(() => {
    sb = makeSandbox();
    sb.pushBranch("keep", "keep.txt", "keep\n");
    sb.pushBranch("gone", "gone.txt", "gone\n");
    sb.pushBranch("landed", "landed.txt", "landed\n");
    sb.bootstrapFi();
    runFi(["--add", "keep", "gone", "landed"], sb.work);
    sb.deleteRemoteBranch("gone");
    sb.git(["merge", "--quiet", "--no-edit", "origin/landed"]);
    sb.git(["push", "--quiet", "origin", "main"]);
  });
  after(() => sb.cleanup());

  test("again drops branches that vanished and branches that landed", () => {
    const r = runFi(["--again"], sb.work);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(listedBranches(sb), ["keep"]);
    assert.match(r.stderr, /Ignoring branches that no longer exist/);
    assert.match(r.stderr, /landed already in main/);
  });

  // Deliberately not asserting that origin/fi's sha changes: re-merging the
  // same branch set onto an unmoved default branch yields a byte-identical
  // commit (same tree, parents, and message), so the sha is legitimately
  // unchanged whenever both runs land in the same second. What distinguishes
  // "re-merged" from the removed short-circuit is that the merge flow ran.
  test("again runs the merge flow when nothing needs dropping", () => {
    const r = runFi(["--again"], sb.work);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(listedBranches(sb), ["keep"]);
    assert.match(r.stdout, /<- re-merging/);
    assert.match(r.stderr, /Done!/);
  });

  // The case the old `--prune` gate skipped: nothing qualifies for dropping,
  // but the default branch has moved, so fi must still be rebuilt on top of it.
  test("again rebuilds fi on a default branch that has moved", () => {
    sb.pushBranch("mainwork", "mainwork.txt", "mainwork\n");
    sb.git(["merge", "--quiet", "--no-edit", "origin/mainwork"]);
    sb.git(["push", "--quiet", "origin", "main"]);
    const movedMain = sb.git(["rev-parse", "origin/main"]);

    const r = runFi(["--again"], sb.work);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(
      sb.git(["merge-base", "origin/main", "origin/fi"]),
      movedMain,
      "fi should be rebuilt on the advanced main, making main an ancestor of fi"
    );
  });
});

describe("--bare / --json on non-list actions (OPT-08)", () => {
  let sb: Sandbox;
  before(() => {
    sb = makeSandbox();
    sb.pushBranch("feature-a", "a.txt", "a\n");
    sb.pushBranch("feature-b", "b.txt", "b\n");
    sb.bootstrapFi();
  });
  after(() => sb.cleanup());

  test("--add --json emits only JSON on stdout, naming the action", () => {
    const r = runFi(["--add", "feature-a", "--json"], sb.work);
    assert.equal(r.status, 0, r.stderr);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.command, "add");
    assert.deepEqual(parsed.branches, ["feature-a"]);
  });

  test("--add --bare emits only the branch names on stdout", () => {
    const r = runFi(["--add", "feature-b", "--bare"], sb.work);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), "feature-a feature-b");
  });

  test("the human merge display stays off stdout in machine modes", () => {
    const r = runFi(["--again", "--json"], sb.work);
    assert.equal(r.status, 0, r.stderr);
    // The `fi:` header, the ` * branch` tree, and `<- re-merging` would all
    // corrupt the JSON if they reached stdout.
    assert.doesNotMatch(r.stdout, /<- re-merging|^fi:/m);
    JSON.parse(r.stdout);
  });

  test("--abort --json still produces JSON (CMD-06)", () => {
    const r = runFi(["--abort", "--json"], sb.work);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).command, "abort");
    assert.match(r.stderr, /Re-pulled/);
  });

  test("a failed merge keeps its diagnostics off stdout", () => {
    const conflict = makeSandbox();
    try {
      conflict.pushBranch("left", "shared.txt", "left side\n");
      conflict.pushBranch("right", "shared.txt", "right side\n");
      conflict.bootstrapFi();
      runFi(["--add", "left"], conflict.work);
      const r = runFi(["--add", "right", "--json"], conflict.work);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /Failed trying to merge/);
      assert.doesNotMatch(r.stdout, /Failed trying to merge/);
    } finally {
      conflict.cleanup();
    }
  });
});

describe("--prune is gone", () => {
  let sb: Sandbox;
  before(() => {
    sb = makeSandbox();
    sb.pushBranch("keep", "keep.txt", "keep\n");
    sb.bootstrapFi();
    runFi(["--add", "keep"], sb.work);
  });
  after(() => sb.cleanup());

  for (const flag of ["--prune", "-p"]) {
    test(`${flag} is rejected as an unknown option`, () => {
      const r = runFi([flag], sb.work);
      assert.equal(r.status, 1);
      assert.ok(
        r.stderr.includes(`Unknown option: ${flag}`),
        `expected an unknown-option error for ${flag}, got: ${r.stderr}`
      );
    });
  }

  test("--again rejects branch names", () => {
    const r = runFi(["--again", "keep"], sb.work);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /--again does not accept branch names/);
  });

  test("help, man page, and completions carry no trace of --prune", () => {
    const help = runFi(["help"], sb.work).stdout;
    assert.doesNotMatch(help, /prune/);
    assert.match(help, /--again/);
    for (const shell of ["bash", "zsh"]) {
      const script = runFi(["install-completions", shell], sb.work).stdout;
      assert.doesNotMatch(script, /prune/, `${shell} completion mentions prune`);
    }
    const man = readFileSync(
      fileURLToPath(new URL("../man/git-fi.1", import.meta.url)),
      "utf-8"
    );
    assert.doesNotMatch(man, /prune/);
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
