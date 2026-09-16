import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import {
  gitFiOnPath,
  isSameInstall,
  shadowingLauncher,
  shadowNotice,
  reachesNotice,
} from "../src/which.ts";
import { makeStyle } from "../src/style.ts";

const OPTS = { debug: false, bare: false, json: false, select: false, yes: false };

/**
 * A directory holding the named files, each with `body` as its contents and the
 * execute bit set — a launcher without it is one git skips, which is its own
 * case below rather than the default every other case is built on.
 */
function dirWith(files: string[], body = "x"): string {
  const dir = mkdtempSync(join(tmpdir(), "git-fi-which-"));
  for (const f of files) writeFileSync(join(dir, f), body, { mode: 0o755 });
  return dir;
}

/**
 * A PATH of real directories, punctuated for the platform running the test.
 *
 * These cases are about resolution order rather than any platform's naming, so
 * they run as the host. Simulating a POSIX PATH from Windows cannot work here:
 * the directories are real, so they carry a drive letter, and splitting
 * `C:\...` on `:` finds nothing — which reads as a passing "found nothing" case
 * rather than as the broken fixture it is.
 */
function onPath(...dirs: string[]): string {
  return dirs.join(delimiter);
}

describe("gitFiOnPath (INSTALL-01)", () => {
  test("reports one launcher per directory, first-resolved first", () => {
    const first = dirWith(["git-fi"]);
    const second = dirWith(["git-fi"]);
    const found = [...gitFiOnPath(onPath(first, second))];
    assert.deepEqual(found, [join(first, "git-fi"), join(second, "git-fi")]);
  });

  test("skips directories with no git-fi, and empty PATH entries", () => {
    const empty = mkdtempSync(join(tmpdir(), "git-fi-which-"));
    const real = dirWith(["git-fi"]);
    assert.deepEqual([...gitFiOnPath(onPath(empty, "", real))], [join(real, "git-fi")]);
  });

  // `npx` links the copy it runs into its own cache and puts that first on
  // PATH. Counting it would find git-fi's own launcher, match it against the
  // copy answering, and report nothing shadowing — on the one route a user
  // whose `git fi` is shadowed has left.
  test("skips the node_modules/.bin directories npx and npm run inject", () => {
    const npx = mkdtempSync(join(tmpdir(), "git-fi-npx-"));
    const bin = join(npx, "node_modules", ".bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "git-fi"), "x", { mode: 0o755 });

    const stale = dirWith(["git-fi"]);
    assert.deepEqual([...gitFiOnPath(onPath(bin, stale))], [join(stale, "git-fi")]);
  });

  test("finds nothing when nothing is named git-fi", () => {
    assert.deepEqual([...gitFiOnPath(onPath(dirWith(["git-fu"])))], []);
  });

  test("stops at the first hit rather than searching the rest of PATH", () => {
    // The only production caller wants one launcher, and a Windows PATH costs a
    // dozen probes per directory to search — so nothing past the winner runs.
    const first = dirWith(["git-fi"]);
    const second = dirWith(["git-fi"]);
    const walk = gitFiOnPath(onPath(first, second));
    assert.equal(walk.next().value, join(first, "git-fi"));
    assert.equal(walk.next().done, false);
  });

  // The Windows ordering is asserted from any platform, because the failure it
  // guards against was only ever observable on a Windows runner. Each case
  // below was measured there: a shim planted ahead of npm's prefix, and `git fi`
  // asked which one it ran.
  describe("on Windows", () => {
    test("prefers a .exe sibling over the extensionless launcher", () => {
      const dir = dirWith(["git-fi", "git-fi.exe"]);
      assert.deepEqual([...gitFiOnPath(dir, "win32")], [join(dir, "git-fi.exe")]);
    });

    test("falls back to the extensionless launcher when no .exe is there", () => {
      const dir = dirWith(["git-fi"]);
      assert.deepEqual([...gitFiOnPath(dir, "win32")], [join(dir, "git-fi")]);
    });

    // The shapes `git fi` cannot reach. PowerShell runs the `.ps1` and
    // `where.exe` lists the `.cmd`, so naming either would send the reader to
    // delete a file that leaves `git fi` exactly as it was.
    test("ignores the .cmd, .bat and .ps1 shims git cannot run", () => {
      const dir = dirWith(["git-fi.cmd", "git-fi.bat", "git-fi.ps1"]);
      assert.deepEqual([...gitFiOnPath(dir, "win32")], []);
    });

    test("picks the extensionless launcher out of npm's own three shims", () => {
      const dir = dirWith(["git-fi", "git-fi.cmd", "git-fi.ps1"]);
      assert.deepEqual([...gitFiOnPath(dir, "win32")], [join(dir, "git-fi")]);
    });

    test("splits PATH on ';' rather than ':'", () => {
      const a = dirWith(["git-fi"]);
      const b = dirWith(["git-fi"]);
      assert.equal([...gitFiOnPath([a, b].join(";"), "win32")].length, 2);
    });

    // `gem install --no-wrappers` — what git-fi's own predecessor told users to
    // run — links the launcher into Ruby's bin directory rather than copying it,
    // so deleting the gem's files by hand leaves the link pointing at nothing.
    // Windows git stops at it and dies (`Maybe git-fi is broken?`) instead of
    // trying the next PATH entry, so it is in the way and has to be named.
    test("sees a leftover gem symlink whose target is gone", () => {
      const dir = mkdtempSync(join(tmpdir(), "git-fi-which-"));
      symlinkSync(join(dir, "gone", "git-fi"), join(dir, "git-fi"));
      assert.deepEqual([...gitFiOnPath(dir, "win32")], [join(dir, "git-fi")]);
    });
  });

  // The same dangling link on POSIX, where git skips what it cannot execute and
  // carries on down PATH — so it shadows nothing and naming it would send the
  // reader after a file that is not the problem.
  //
  // Unlike the naming order above, these cannot be simulated from Windows: the
  // platform argument picks the rule, but `X_OK` is answered by the filesystem
  // the test is running on, and Windows has no execute bit for it to read.
  describe("on POSIX", { skip: process.platform === "win32" }, () => {
    test("ignores a symlink whose target is gone", () => {
      const dir = mkdtempSync(join(tmpdir(), "git-fi-which-"));
      symlinkSync(join(dir, "gone", "git-fi"), join(dir, "git-fi"));
      assert.deepEqual([...gitFiOnPath(dir, "linux")], []);
    });

    test("ignores a launcher without the execute bit", () => {
      const dir = mkdtempSync(join(tmpdir(), "git-fi-which-"));
      writeFileSync(join(dir, "git-fi"), "x", { mode: 0o644 });
      assert.deepEqual([...gitFiOnPath(dir, "linux")], []);
    });

    test("sees an executable launcher", () => {
      const dir = dirWith(["git-fi"]);
      assert.deepEqual([...gitFiOnPath(dir, "linux")], [join(dir, "git-fi")]);
    });
  });
});

describe("isSameInstall (INSTALL-01)", () => {
  const pkg = mkdtempSync(join(tmpdir(), "git-fi-pkg-"));
  const entry = join(pkg, "index.js");
  writeFileSync(entry, "");

  /**
   * An npm prefix: a launcher beside the package it points at, the way a global
   * install lays it out. Returns the launcher and the entry point it names.
   */
  function prefixWith(launcher: string, body: (target: string) => string) {
    const dir = mkdtempSync(join(tmpdir(), "git-fi-bin-"));
    const target = join(dir, "node_modules", "@gettyimages", "git-fi", "dist", "index.js");
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, "");
    writeFileSync(join(dir, launcher), body(target));
    return { launcher: join(dir, launcher), target };
  }

  test("a symlinked launcher resolves to the copy it points at", () => {
    const bin = mkdtempSync(join(tmpdir(), "git-fi-bin-"));
    const launcher = join(bin, "git-fi");
    symlinkSync(entry, launcher);
    assert.equal(isSameInstall(launcher, entry), true);
  });

  test("a wrapper counts as the same install when it names this copy", () => {
    const { launcher, target } = prefixWith(
      "git-fi.cmd",
      () => `node "%~dp0\\node_modules\\@gettyimages\\git-fi\\dist\\index.js" %*`
    );
    assert.equal(isSameInstall(launcher, target), true);
  });

  test("a second prefix's wrapper is a different install, not this one", () => {
    // An nvm/fnm switch leaves two prefixes, each with a launcher naming this
    // same package — which is exactly the shadow the notice exists for, and
    // would read as "same install" to anything matching on the package name.
    const mine = prefixWith("git-fi.cmd", () => "");
    const theirs = prefixWith(
      "git-fi.cmd",
      () => `node "%~dp0\\node_modules\\@gettyimages\\git-fi\\dist\\index.js" %*`
    );
    assert.equal(isSameInstall(theirs.launcher, mine.target), false);
  });

  test("a leftover launcher from another tool is not this install", () => {
    // Shaped like the RubyGems launcher that started this: it names a gem, and
    // nothing about the npm package.
    const dir = dirWith(["git-fi"], "#!/usr/bin/env ruby\nrequire 'git_fi'\n");
    assert.equal(isSameInstall(join(dir, "git-fi"), entry), false);
  });

  test("a launcher that cannot be read is not this install", () => {
    assert.equal(isSameInstall(join(pkg, "does-not-exist"), entry), false);
  });
});

describe("shadowingLauncher (INSTALL-01)", () => {
  const pkg = mkdtempSync(join(tmpdir(), "git-fi-pkg-"));
  const entry = join(pkg, "index.js");
  writeFileSync(entry, "");

  test("names the launcher that wins when it is not this copy", () => {
    const stale = dirWith(["git-fi"], "#!/usr/bin/env ruby\n");
    assert.equal(shadowingLauncher(entry, onPath(stale)), join(stale, "git-fi"));
  });

  test("stays silent when this copy is the one PATH resolves", () => {
    const bin = mkdtempSync(join(tmpdir(), "git-fi-bin-"));
    symlinkSync(entry, join(bin, "git-fi"));
    assert.equal(shadowingLauncher(entry, onPath(bin)), null);
  });

  test("stays silent when no git-fi is on PATH", () => {
    assert.equal(shadowingLauncher(entry, onPath(dirWith([]))), null);
  });

  test("stays silent when the running entry point is unknown", () => {
    assert.equal(shadowingLauncher(undefined, onPath(dirWith(["git-fi"]))), null);
  });

  test("stays silent when the running entry point does not resolve", () => {
    // Reporting a shadow means naming the copy being shadowed, and there is no
    // such path to name — so INSTALL-01 asks for silence rather than a notice
    // pointing at nothing.
    const gone = join(pkg, "does-not-exist.js");
    assert.equal(shadowingLauncher(gone, onPath(dirWith(["git-fi"]))), null);
  });

  test("only the first directory decides, not every match", () => {
    const stale = dirWith(["git-fi"], "#!/usr/bin/env ruby\n");
    const bin = mkdtempSync(join(tmpdir(), "git-fi-bin-"));
    symlinkSync(entry, join(bin, "git-fi"));
    // The real install is on PATH too, just behind the leftover — which is the
    // whole shape of the bug, and would read as fine if any match counted.
    assert.equal(shadowingLauncher(entry, onPath(stale, bin)), join(stale, "git-fi"));
  });
});

describe("shadowNotice (INSTALL-01)", () => {
  const s = makeStyle(OPTS);

  test("names both paths, so the reader can tell which to delete", () => {
    const notice = shadowNotice("/ruby/bin/git-fi", "/npm/lib/git-fi/dist/index.js", s);
    assert.ok(notice.includes("/ruby/bin/git-fi"), notice);
    assert.ok(notice.includes("/npm/lib/git-fi/dist/index.js"), notice);
  });

  test("gives both ways out, not just deletion", () => {
    const notice = shadowNotice("/ruby/bin/git-fi", "/npm/git-fi", s);
    assert.ok(notice.includes("npm config get prefix"), notice);
  });
});

describe("reachesNotice (INSTALL-01, under npx)", () => {
  const s = makeStyle(OPTS);

  test("names the launcher PATH resolves", () => {
    assert.match(reachesNotice("/ruby/bin/git-fi", s), /git fi reaches\s+\/ruby\/bin\/git-fi/);
  });

  // npx runs a copy it unpacked a moment ago, so the user's own global install
  // is a different copy. Carrying the notice's heading and remedy across would
  // name that install as the thing in the way and tell them to delete it.
  test("passes no verdict on what it names", () => {
    const notice = reachesNotice("/opt/homebrew/bin/git-fi", s);
    assert.doesNotMatch(notice, /ahead of this one/);
    assert.doesNotMatch(notice, /Delete/);
  });
});
