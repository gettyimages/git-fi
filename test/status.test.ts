import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { STATUS_EMOJI, STATUS_WORD, statusLabel } from "../src/gitlab.ts";
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
