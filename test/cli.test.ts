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

describe("generated completions (CMP-01a)", () => {
  const read = (name: string) =>
    readFileSync(fileURLToPath(new URL(`../completions/${name}`, import.meta.url)), "utf8");

  test("the git-native completer reads $words, not COMP_WORDS", () => {
    // git's zsh wrapper leaves COMP_WORDS unset, so action detection must read
    // the command line from git's portable $words array (see CMP-01a).
    for (const name of ["git-fi.bash", "_git_fi"]) {
      const src = read(name);
      assert.match(src, /for w in "\$\{words\[@\]\}"/, `${name} should iterate $words`);
      assert.doesNotMatch(src, /\$\{?COMP_WORDS/, `${name} should not expand COMP_WORDS`);
    }
  });

  test("_git_fi is fpath-autoloadable and shares the bash body", () => {
    const zfp = read("_git_fi");
    assert.match(zfp.split("\n")[0], /^#autoload$/, "first line must be #autoload for compinit");
    // The two git-native files must define the same function so they can't drift.
    const body = (s: string) => s.slice(s.indexOf("_git_fi () {"));
    assert.equal(body(zfp), body(read("git-fi.bash")));
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
