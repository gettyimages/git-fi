import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import { isNewer, cachePath } from "../src/update-check.ts";

describe("isNewer", () => {
  test("true when latest is ahead", () => {
    assert.equal(isNewer("1.0.1", "1.0.0"), true);
    assert.equal(isNewer("1.1.0", "1.0.9"), true);
    assert.equal(isNewer("2.0.0", "1.9.9"), true);
  });

  test("false when equal or behind", () => {
    assert.equal(isNewer("1.0.0", "1.0.0"), false);
    assert.equal(isNewer("1.0.0", "1.0.1"), false);
    assert.equal(isNewer("1.9.9", "2.0.0"), false);
  });

  test("compares numerically, not lexically", () => {
    assert.equal(isNewer("1.10.0", "1.2.0"), true);
    assert.equal(isNewer("1.2.0", "1.10.0"), false);
  });

  test("ignores prerelease suffixes", () => {
    assert.equal(isNewer("1.0.0-rc.1", "1.0.0"), false);
    assert.equal(isNewer("1.0.1-rc.1", "1.0.0"), true);
  });
});

describe("cachePath", () => {
  test("honors XDG_CACHE_HOME", () => {
    const prev = process.env.XDG_CACHE_HOME;
    process.env.XDG_CACHE_HOME = "/tmp/xdg";
    try {
      assert.equal(cachePath(), join("/tmp/xdg", "git-fi", "update-check.json"));
    } finally {
      if (prev === undefined) delete process.env.XDG_CACHE_HOME;
      else process.env.XDG_CACHE_HOME = prev;
    }
  });

  test("falls back to ~/.cache", () => {
    const prev = process.env.XDG_CACHE_HOME;
    delete process.env.XDG_CACHE_HOME;
    try {
      assert.equal(cachePath(), join(homedir(), ".cache", "git-fi", "update-check.json"));
    } finally {
      if (prev !== undefined) process.env.XDG_CACHE_HOME = prev;
    }
  });
});
