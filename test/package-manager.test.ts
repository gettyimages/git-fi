import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PackageManager } from "../src/package-manager.ts";

describe("PackageManager.detect (UPDATE-05)", () => {
  const name = "@gettyimages/git-fi";
  const detected = (entry: string | undefined) => PackageManager.detect(name, entry).command;

  /** A package directory under `modulesDir`, holding the entry point npm and pnpm both run. */
  function stagePackage(modulesDir: string): string {
    const entry = join(modulesDir, "@gettyimages", "git-fi", "dist", "index.js");
    mkdirSync(dirname(entry), { recursive: true });
    writeFileSync(entry, "");
    return entry;
  }

  /** A `node_modules` pnpm manages: the one marker every pnpm version writes. */
  function pnpmModules(root: string): string {
    const modulesDir = join(root, "node_modules");
    mkdirSync(modulesDir, { recursive: true });
    writeFileSync(join(modulesDir, ".modules.yaml"), "layoutVersion: 5\n");
    return modulesDir;
  }

  const temp = () => mkdtempSync(join(tmpdir(), "git-fi-pm-"));

  test("a package in a pnpm-managed node_modules (pnpm 10 and earlier)", () => {
    const entry = stagePackage(pnpmModules(join(temp(), "global", "5")));
    assert.equal(detected(entry), "pnpm");
  });

  test("a package linked into the store, launched through the global directory (pnpm 11+)", () => {
    // The newer layout resolves the package into the store, where no marker is;
    // only the path pnpm's launcher hands node still passes through it.
    const root = temp();
    const storeEntry = stagePackage(join(root, "store", "links", "node_modules"));
    const modulesDir = pnpmModules(join(root, "global", "v11", "abc123"));
    mkdirSync(join(modulesDir, "@gettyimages"));
    symlinkSync(dirname(dirname(storeEntry)), join(modulesDir, "@gettyimages", "git-fi"), "junction");
    assert.equal(detected(join(modulesDir, "@gettyimages", "git-fi", "dist", "index.js")), "pnpm");
  });

  test("an entry path carrying a ./ segment, as pnpm records it", () => {
    const modulesDir = pnpmModules(temp());
    stagePackage(modulesDir);
    assert.equal(detected(join(modulesDir, "@gettyimages", "git-fi") + "/./dist/index.js"), "pnpm");
  });

  test("a package in npm's global node_modules", () => {
    const entry = stagePackage(join(temp(), "lib", "node_modules"));
    assert.equal(detected(entry), "npm");
  });

  test("npm's symlinked bin launcher, resolved into an unmarked node_modules", () => {
    const prefix = temp();
    const entry = stagePackage(join(prefix, "lib", "node_modules"));
    mkdirSync(join(prefix, "bin"));
    symlinkSync(entry, join(prefix, "bin", "git-fi"));
    assert.equal(detected(join(prefix, "bin", "git-fi")), "npm");
  });

  test("npm's prefix inside a pnpm-managed tree is still npm's", () => {
    // Node installed as a pnpm global puts npm's prefix under pnpm's
    // node_modules; only the directory holding git-fi decides.
    const outer = pnpmModules(join(temp(), "global", "v11", "abc123"));
    const entry = stagePackage(join(outer, "node", "lib", "node_modules"));
    assert.equal(detected(entry), "npm");
  });

  test("an entry that does not resolve", () => {
    assert.equal(detected(join(temp(), "missing", "dist", "index.js")), "npm");
    assert.equal(detected(undefined), "npm");
  });
});
