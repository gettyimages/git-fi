import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { STATUS_EMOJI, STATUS_WORD, printBranchLinks, statusLabel } from "../src/gitlab.ts";
import type { Options } from "../src/types.ts";

const PLAIN: Options = {
  debug: false,
  bare: true,
  json: false,
  select: false,
  yes: false,
};

describe("statusLabel", () => {
  // The label is the only thing carrying pipeline status in the table and on
  // the `fi:` line. A status in one table and not the other renders as an
  // empty cell, so the column silently stops carrying its one fact.
  test("the glyph and word tables cover the same statuses", () => {
    assert.deepEqual(
      Object.keys(STATUS_EMOJI).sort(),
      Object.keys(STATUS_WORD).sort()
    );
  });

  test("renders the word where a glyph would not be drawn", () => {
    for (const [status, word] of Object.entries(STATUS_WORD)) {
      assert.equal(statusLabel(status, PLAIN), word);
    }
  });

  test("an unrecognized status renders as nothing, not as 'undefined'", () => {
    assert.equal(statusLabel("no-such-status", PLAIN), "");
  });
});

describe("printBranchLinks (GITLAB-09)", () => {
  const gitlab = { host: "gitlab.example.com", project: "group/proj" };
  const OPTS: Options = { ...PLAIN, bare: false };

  function capture(fn: () => void): string {
    const write = process.stdout.write;
    let out = "";
    process.stdout.write = ((chunk: string) => {
      out += chunk;
      return true;
    }) as typeof process.stdout.write;
    try {
      fn();
    } finally {
      process.stdout.write = write;
    }
    return out;
  }

  test("lists each compare URL on its own line, aligned, below the table", () => {
    const out = capture(() =>
      printBranchLinks(["origin/feature-auth", "origin/fix"], gitlab, "main", OPTS)
    );
    assert.equal(
      out,
      "\n" +
        "feature-auth  https://gitlab.example.com/group/proj/-/compare/main...feature-auth\n" +
        "fix           https://gitlab.example.com/group/proj/-/compare/main...fix\n"
    );
  });

  test("prints nothing without a GitLab project to link to", () => {
    assert.equal(capture(() => printBranchLinks(["origin/fix"], null, "main", OPTS)), "");
  });

  test("prints nothing for an empty fi", () => {
    assert.equal(capture(() => printBranchLinks([], gitlab, "main", OPTS)), "");
  });
});
