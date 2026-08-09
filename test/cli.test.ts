import { test, before, after, beforeEach, afterEach, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, readdirSync, writeFileSync, chmodSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { runFi, makeSandbox, type Sandbox } from "./helpers.ts";

const { name, version } = createRequire(import.meta.url)("../package.json");

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

  test("--select cannot be combined with --json or --bare (OPTION-09)", () => {
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
    assert.match(r.stdout, /install-completions <bash\|zsh\|zsh-git>/);
    assert.match(r.stdout, /install-completions --write <dir>/);
  });

  test("install-completions bash prints the bash script (COMPLETE-05)", () => {
    const r = runFi(["install-completions", "bash"], dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /_git_fi \(\) \{/);
  });

  test("install-completions zsh prints the zsh script (COMPLETE-05)", () => {
    const r = runFi(["install-completions", "zsh"], dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /#compdef git-fi/);
  });

  test("install-completions zsh-git prints the fpath _git_fi (COMPLETE-05)", () => {
    // Every provider in COMPLETE-02 must be installable through the subcommand: this
    // is the file git's own zsh wrapper dispatches to, and without a target for
    // it `git fi <TAB>` has no completion on a stock macOS/Homebrew git.
    const r = runFi(["install-completions", "zsh-git"], dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout.split("\n")[0], /^#autoload$/);
    assert.match(r.stdout, /_git_fi \(\) \{/);
  });

  test("install-completions detects the shell from $SHELL", () => {
    const r = runFi(["install-completions"], dir, { SHELL: "/bin/bash" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /_git_fi \(\) \{/);
  });

  test("install-completions aborts on an unsupported shell", () => {
    const r = runFi(["install-completions"], dir, { SHELL: "/usr/bin/fish" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /install-completions <bash\|zsh\|zsh-git>/);
  });

  test("install-completions aborts on an unknown target", () => {
    const r = runFi(["install-completions", "zsh-native"], dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /install-completions <bash\|zsh\|zsh-git>/);
  });

  test("--write installs both zsh files into a new directory (COMPLETE-06)", () => {
    // One command covers both providers in COMPLETE-02 — the point of --write is that
    // the user doesn't have to work out which _git they have.
    const target = join(dir, "fpath", "nested");
    const r = runFi(["install-completions", "--write", target], dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(readFileSync(join(target, "_git-fi"), "utf8"), /^#compdef git-fi/);
    assert.match(readFileSync(join(target, "_git_fi"), "utf8"), /^#autoload/);
    assert.match(r.stdout, /Wrote .*_git-fi/);
    assert.match(r.stdout, /Wrote .*_git_fi/);
    assert.match(r.stdout, /compinit/);
  });

  test("--write with a target installs only that file (COMPLETE-06)", () => {
    const target = join(dir, "fpath-one");
    const r = runFi(["install-completions", "zsh-git", "--write", target], dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(readFileSync(join(target, "_git_fi"), "utf8"), /^#autoload/);
    assert.throws(() => readFileSync(join(target, "_git-fi"), "utf8"));
  });

  test("--write rejects bash, which has no fpath (COMPLETE-06)", () => {
    const target = join(dir, "fpath-bash");
    const r = runFi(["install-completions", "bash", "--write", target], dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /not bash/);
    assert.throws(() => readFileSync(join(target, "git-fi.bash"), "utf8"));
  });

  test("--write aborts without a directory (COMPLETE-06)", () => {
    const r = runFi(["install-completions", "--write"], dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /--write needs a directory/);
  });

  test("install-completions aborts on an unknown option", () => {
    const r = runFi(["install-completions", "--install"], dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Unknown option: --install/);
  });

  test("--write names an unwritable directory and how to fix it (COMPLETE-06)", () => {
    // A path whose parent is a regular file, which mkdir refuses everywhere;
    // /dev/null/nope only names an unwritable path on POSIX.
    const blocker = join(dir, "not-a-dir");
    writeFileSync(blocker, "");
    const target = join(blocker, "nope");
    const r = runFi(["install-completions", "--write", target], dir);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes(target), r.stderr);
    assert.match(r.stderr, /Pick a directory you own/);
  });
});

describe("--update (UPDATE-05)", () => {
  let dir: string;
  let path: string;
  let argvLog: string;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "git-fi-update-"));
    const bin = join(dir, "bin");
    argvLog = join(dir, "npm-argv");
    mkdirSync(bin);
    // Stand-in npm: records the arguments git-fi handed it, and exits with
    // whatever the test asks for. Running the real npm would reinstall the
    // developer's global git-fi mid-suite.
    //
    // The recording lives in a node script behind a per-platform launcher: the
    // shebang a lone `sh` shim relies on means nothing to Windows, which needs
    // an `npm.cmd` to match how it resolves npm on PATH.
    const shim = join(dir, "npm-shim.mjs");
    writeFileSync(
      shim,
      `import { writeFileSync } from "node:fs";\n` +
        `writeFileSync(${JSON.stringify(argvLog)}, process.argv.slice(2).join("\\n") + "\\n");\n` +
        `process.exit(Number(process.env.FAKE_NPM_EXIT ?? 0));\n`
    );
    if (process.platform === "win32") {
      writeFileSync(
        join(bin, "npm.cmd"),
        `@echo off\r\n"${process.execPath}" "${shim}" %*\r\nexit /b %ERRORLEVEL%\r\n`
      );
    } else {
      writeFileSync(join(bin, "npm"), `#!/bin/sh\nexec "${process.execPath}" "${shim}" "$@"\n`, {
        mode: 0o755,
      });
    }
    path = bin + delimiter + process.env.PATH;
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  const npmArgv = () => readFileSync(argvLog, "utf8").trim().split("\n");

  test("installs the latest published version, from outside a git repo", () => {
    // `dir` is a bare temp directory: updating must not require a repo.
    const r = runFi(["--update"], dir, { PATH: path });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(npmArgv(), ["install", "-g", `${name}@latest`]);
  });

  test("-u is the same action", () => {
    const r = runFi(["-u"], dir, { PATH: path });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(npmArgv(), ["install", "-g", `${name}@latest`]);
  });

  test("exits with npm's exit code and adds no wrapper output", () => {
    const r = runFi(["--update"], dir, { PATH: path, FAKE_NPM_EXIT: "17" });
    assert.equal(r.status, 17);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr, "");
  });

  test("reports a missing npm rather than exiting silently", () => {
    const empty = join(dir, "empty");
    mkdirSync(empty, { recursive: true });
    const r = runFi(["--update"], dir, { PATH: empty });
    if (process.platform === "win32") {
      // The shell resolves npm there (see updateSelf), so spawn succeeds and a
      // missing command is cmd's error to report and cmd's exit code to pick —
      // git-fi never sees a spawn failure of its own to translate.
      assert.notEqual(r.status, 0, r.stderr);
    } else {
      assert.equal(r.status, 1);
      assert.match(r.stderr, /Could not run npm/);
    }
  });

  test("collides with the actions the way they collide with each other", () => {
    const both = runFi(["--add", "--update"], dir, { PATH: path });
    assert.equal(both.status, 1);
    assert.match(both.stderr, /Cannot combine --add with --update/);

    const reversed = runFi(["--update", "--again"], dir, { PATH: path });
    assert.equal(reversed.status, 1);
    assert.match(reversed.stderr, /Cannot combine --update with --again/);
  });

  test("rejects branch names, so a slip for --add cannot reinstall instead", () => {
    const r = runFi(["--update", "my-branch"], dir, { PATH: path });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /--update does not accept branch names/);
  });
});

describe("postinstall completion install (COMPLETE-07)", () => {
  const script = fileURLToPath(new URL("../scripts/postinstall.mjs", import.meta.url));
  let dir: string;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), "git-fi-prefix-"));
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  /** Run the postinstall as npm would, with the given npm_config_* env. */
  const run = (env: Record<string, string>) =>
    spawnSync(process.execPath, [script], { encoding: "utf-8", env: { ...process.env, ...env } });

  test("a global install writes both zsh files under npm's prefix", () => {
    const prefix = join(dir, "global");
    const r = run({ npm_config_global: "true", npm_config_prefix: prefix });
    assert.equal(r.status, 0, r.stderr);
    const dest = join(prefix, "share", "zsh", "site-functions");
    assert.match(readFileSync(join(dest, "_git-fi"), "utf8"), /^#compdef git-fi/);
    assert.match(readFileSync(join(dest, "_git_fi"), "utf8"), /^#autoload/);
    assert.match(r.stdout, /installed zsh completion/);
  });

  test("a local install writes nothing and says nothing", () => {
    const prefix = join(dir, "local");
    const r = run({ npm_config_global: "", npm_config_prefix: prefix });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), "");
    assert.throws(() => readFileSync(join(prefix, "share", "zsh", "site-functions", "_git-fi")));
  });

  test("an unwritable prefix reports the manual command without failing", () => {
    // A postinstall that exits non-zero fails `npm install -g` outright, so a
    // root-owned prefix has to degrade to advice, not an error.
    const blocker = join(dir, "not-a-prefix");
    writeFileSync(blocker, "");
    const r = run({ npm_config_global: "true", npm_config_prefix: join(blocker, "nope") });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /install-completions --write/);
  });

  test("installs exactly the files --write installs", () => {
    // The names live in both places (the postinstall can't import the compiled
    // TypeScript — npm runs it before the build), so pin them together.
    const prefix = join(dir, "parity");
    assert.equal(run({ npm_config_global: "true", npm_config_prefix: prefix }).status, 0);
    const written = join(dir, "parity-write");
    assert.equal(runFi(["install-completions", "--write", written], dir).status, 0);
    assert.deepEqual(
      readdirSync(join(prefix, "share", "zsh", "site-functions")).sort(),
      readdirSync(written).sort()
    );
  });
});

describe("generated completions (COMPLETE-02)", () => {
  const read = (name: string) =>
    readFileSync(fileURLToPath(new URL(`../completions/${name}`, import.meta.url)), "utf8");

  test("the git-native completer reads $words, not COMP_WORDS", () => {
    // git's zsh wrapper leaves COMP_WORDS unset, so action detection must read
    // the command line from git's portable $words array (see COMPLETE-02).
    for (const name of ["git-fi.bash", "_git_fi"]) {
      const src = read(name);
      assert.match(src, /for w in "\$\{words\[@\]\}"/, `${name} should iterate $words`);
      assert.doesNotMatch(src, /\$\{?COMP_WORDS/, `${name} should not expand COMP_WORDS`);
    }
  });

  test("_git-fi calls its completer so the first <TAB> completes", () => {
    // zsh's autoload runs the file as the body of _git-fi. A file that only
    // *defines* the completer leaves the first tab in each shell doing nothing
    // but the definition, which reads as a silent beep.
    assert.match(read("_git-fi").trimEnd(), /\n_git-fi "\$@"$/);
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

describe("non-interactive bootstrap (MERGE-15)", () => {
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

describe("commit message format (STORAGE-01..STORAGE-04)", () => {
  const fiMessage = (sb: Sandbox) =>
    sb.git(["log", "-1", "--format=%B", "origin/fi"]);

  test("always writes the legacy format during the rollout (STORAGE-04)", () => {
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

  test("reads a terse-format fi; writes stay legacy, not terse (STORAGE-02/STORAGE-04)", () => {
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
    assert.match(r.stdout, /re-merged fi/);
  });

  // TERM-09. The annotations are drawn to be rewritten in place; off a TTY the
  // rewrite never comes, so drawing them at all would leave a log whose only
  // statement of the outcome is the *initial* verb — "re-merging" — for an
  // operation that finished.
  test("again states the outcome once off a TTY, with no in-flight verbs", () => {
    const r = runFi(["--again"], sb.work);
    assert.equal(r.status, 0, r.stderr);
    const all = r.stdout + r.stderr;
    for (const verb of ["re-merging", "merging", "committing", "pushing"]) {
      assert.ok(
        !all.includes(`<- ${verb}`),
        `off-TTY output should not carry the '<- ${verb}' annotation`
      );
    }
    assert.equal(
      r.stdout.match(/re-merged fi/g)?.length,
      1,
      "the outcome should be stated exactly once"
    );
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

describe("--bare / --json on non-list actions (OPTION-08)", () => {
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

  test("--abort --json still produces JSON (COMMAND-06)", () => {
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
    for (const shell of ["bash", "zsh", "zsh-git"]) {
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

  // The suite runs off a TTY, which is itself one of the suppressing conditions
  // (LIST-04) — so every case here is a negative. The hint's positive path needs a
  // real terminal; `hintsEnabled` is unit-tested for the rest in style.test.ts.
  test("no hint off a TTY — a pipe has no reader to act on the advice", () => {
    const r = runFi([], sb.work);
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stdout, /--auth=login/);
  });

  test("no hint under $CI, the case the runner hit", () => {
    const r = runFi([], sb.work, { CI: "true" });
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stdout, /--auth=login/);
  });

  test("GIT_FI_NO_HINTS suppresses the hint", () => {
    const r = runFi([], sb.work, { GIT_FI_NO_HINTS: "1" });
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stdout, /--auth=login/);
  });
});

describe("--auth (AUTH-05, AUTH-06, AUTH-07, AUTH-11)", () => {
  let sb: Sandbox;
  let configHome: string;
  const HOST = "gitlab.example.com";

  /** A config file as `--auth=login` would have written it. */
  function seedToken(scopes = ["read_api"]): void {
    mkdirSync(join(configHome, "git-fi"), { recursive: true });
    writeFileSync(
      join(configHome, "git-fi", "config.json"),
      JSON.stringify({
        schemaVersion: 1,
        hosts: {
          [HOST]: {
            token: "glpat-abcdefghij9876",
            scopes,
            expiresAt: "2027-01-01",
            storedAt: "2026-08-08T00:00:00.000Z",
          },
        },
      }),
      { mode: 0o600 }
    );
  }

  before(() => {
    sb = makeSandbox();
    // The sandbox origin is a local path, so give it a GitLab-shaped one for
    // the host detection --auth reads (AUTH-07).
    sb.git(["remote", "set-url", "origin", `git@${HOST}:group/repo.git`]);
  });
  after(() => sb.cleanup());

  beforeEach(() => {
    configHome = mkdtempSync(join(tmpdir(), "git-fi-cli-xdg-"));
  });
  afterEach(() => rmSync(configHome, { recursive: true, force: true }));

  test("collides with the actions the way they collide with each other", () => {
    const r = runFi(["--add", "--auth"], sb.work);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Cannot combine --add with --auth/);
  });

  test("rejects branch names — a token action takes no branch", () => {
    const r = runFi(["--auth", "feature-a"], sb.work);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /--auth does not accept branch names/);
  });

  test("an unrecognized action names the three that exist", () => {
    const r = runFi(["--auth=renew"], sb.work, { XDG_CONFIG_HOME: configHome });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /login, status, or logout/);
  });

  test("--host outside --auth is rejected rather than silently ignored", () => {
    const r = runFi(["--host", "gitlab.com"], sb.work);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /--host is only valid with --auth/);
  });

  test("--host with no value is rejected, not treated as a branch", () => {
    const r = runFi(["--auth", "--host"], sb.work);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /--host requires a hostname/);
  });

  test("with nothing stored, status says so and names the login", () => {
    const r = runFi(["--auth"], sb.work, { XDG_CONFIG_HOME: configHome });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, new RegExp(`Host:\\s+${HOST}`));
    assert.match(r.stdout, /git fi --auth=login/);
  });

  test("bare --auth and --auth=status are the same command", () => {
    const e = { XDG_CONFIG_HOME: configHome };
    assert.equal(
      runFi(["--auth"], sb.work, e).stdout,
      runFi(["--auth=status"], sb.work, e).stdout
    );
  });

  test("status reports the stored token's scopes, expiry, and last 4 — never the token", () => {
    seedToken();
    const r = runFi(["--auth"], sb.work, { XDG_CONFIG_HOME: configHome });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Scopes:\s+read_api/);
    assert.match(r.stdout, /Expires:\s+2027-01-01/);
    assert.match(r.stdout, /Token:\s+\.\.\.9876/);
    assert.doesNotMatch(r.stdout, /glpat-abcdefghij9876/, "the value must never be printed");
  });

  test("status says when a stored token is shadowing an export", () => {
    seedToken();
    const r = runFi(["--auth"], sb.work, {
      XDG_CONFIG_HOME: configHome,
      GITLAB_ACCESS_TOKEN: "glpat-exported",
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /GITLAB_ACCESS_TOKEN is set and being ignored/);
  });

  test("status warns when the stored token is broader than read_api", () => {
    seedToken(["api"]);
    const r = runFi(["--auth"], sb.work, { XDG_CONFIG_HOME: configHome });
    assert.match(r.stdout, /broader than git-fi needs/);
    assert.match(r.stdout, /it carries api/);
  });

  test("an exported token reports its source without inventing scopes for it", () => {
    const r = runFi(["--auth"], sb.work, {
      XDG_CONFIG_HOME: configHome,
      GITLAB_ACCESS_TOKEN: "glpat-exported",
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Source:\s+GITLAB_ACCESS_TOKEN/);
    assert.match(r.stdout, /not recorded for an exported token/);
  });

  test(
    "a config file readable beyond its owner is refused, not read",
    { skip: process.platform === "win32" },
    () => {
      seedToken();
      chmodSync(join(configHome, "git-fi", "config.json"), 0o644);
      const r = runFi(["--auth"], sb.work, { XDG_CONFIG_HOME: configHome });
      assert.equal(r.status, 1);
      assert.match(r.stderr, /readable beyond its owner/);
      assert.match(r.stderr, /chmod 600/);
    }
  );

  test("logout removes the stored token, and names the export it falls back to", () => {
    seedToken();
    const r = runFi(["--auth=logout"], sb.work, {
      XDG_CONFIG_HOME: configHome,
      GITLAB_ACCESS_TOKEN: "glpat-exported",
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Removed the stored token/);
    assert.match(r.stdout, /GITLAB_ACCESS_TOKEN is set; git-fi will use it for this host/);

    const later = runFi(["--auth"], sb.work, { XDG_CONFIG_HOME: configHome });
    assert.match(later.stdout, /Token:\s+none/);
  });

  test("logout with nothing stored is not an error", () => {
    const r = runFi(["--auth=logout"], sb.work, { XDG_CONFIG_HOME: configHome });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /No stored token/);
  });

  test("--host makes --auth work outside a repository, which is the point of it", () => {
    const outside = mkdtempSync(join(tmpdir(), "git-fi-norepo-"));
    try {
      const r = runFi(["--auth", "--host", "gitlab.com"], outside, {
        XDG_CONFIG_HOME: configHome,
      });
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /Host:\s+gitlab\.com/);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test("without a GitLab origin and without --host, it names the override", () => {
    const outside = mkdtempSync(join(tmpdir(), "git-fi-norepo-"));
    try {
      const r = runFi(["--auth"], outside, { XDG_CONFIG_HOME: configHome });
      assert.equal(r.status, 1);
      assert.match(r.stderr, /No GitLab origin detected/);
      assert.match(r.stderr, /--host <hostname>/);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
