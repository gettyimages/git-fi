import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseBranchList } from "../src/git.ts";

describe("parseBranchList", () => {
  test("legacy: reads branches from a plain merge message", () => {
    const msg =
      "Merge remote-tracking branches 'origin/feature-a' and 'origin/feature-b' into fi";
    assert.deepEqual(parseBranchList(msg, "main"), [
      "origin/feature-a",
      "origin/feature-b",
    ]);
  });

  test("terse: reads branches from the compact signature", () => {
    assert.deepEqual(parseBranchList("(feature-a, feature-b)@[abc1234]", "main"), [
      "origin/feature-a",
      "origin/feature-b",
    ]);
  });

  // Regression (BL-04 rollout): the CI commit message embeds the previous fi
  // message in a "Was originally: ---" preamble. Only the final signature
  // paragraph must be parsed, or branches removed in this operation resurface
  // from the preamble and accumulate across re-merges.
  test("legacy CI: ignores branches embedded in the Was-originally preamble", () => {
    const preamble =
      "Re-merge fi branch triggered by build 42 due to commit on trunk. " +
      "Was originally: --- Merge remote-tracking branches " +
      "'origin/feature-a' and 'origin/feature-removed' into fi";
    const signature = "Merge remote-tracking branch 'origin/feature-a' into fi";
    const msg = `${preamble}\n\n${signature}`;
    assert.deepEqual(parseBranchList(msg, "main"), ["origin/feature-a"]);
  });

  test("terse CI: parses the final signature, not an embedded prior one", () => {
    const msg =
      "Re-merge fi branch triggered by build 42 due to commit on trunk. " +
      "Was originally: --- (feature-a, feature-removed)@[aaa1111]" +
      "\n\n(feature-a)@[bbb2222]";
    assert.deepEqual(parseBranchList(msg, "main"), ["origin/feature-a"]);
  });

  test("filters out the default branch", () => {
    const msg =
      "Merge remote-tracking branches 'origin/main' and 'origin/feature-a' into fi";
    assert.deepEqual(parseBranchList(msg, "main"), ["origin/feature-a"]);
  });
});
