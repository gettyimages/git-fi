import { test, beforeEach, afterEach, describe } from "node:test";
import assert from "node:assert/strict";
import { runFi, makeSandbox, type Sandbox } from "./helpers.ts";
import { parseBranchList } from "../src/git.ts";

const BOTH_SIGNATURE =
  "Merge remote-tracking branches 'origin/feature-a' and 'origin/feature-b' into fi";

function ciEnv(pipelineId: number): Record<string, string> {
  return {
    CI: "true",
    CI_PIPELINE_ID: String(pipelineId),
    CI_COMMIT_REF_NAME: "feature-a",
  };
}

function buildLine(pipelineId: number): string {
  return `Re-merge fi branch triggered by build ${pipelineId} due to commit on feature-a.`;
}

function fiMessage(sb: Sandbox): string {
  sb.git(["fetch", "--quiet", "origin"]);
  return sb.git(["log", "-1", "--format=%B", "origin/fi"]);
}

describe("fi commit message (MERGE-13, STORAGE-05)", () => {
  let sb: Sandbox;
  beforeEach(() => {
    sb = makeSandbox();
    sb.pushBranch("feature-a", "a.txt", "a\n");
    sb.pushBranch("feature-b", "b.txt", "b\n");
    sb.bootstrapFi();
  });
  afterEach(() => sb.cleanup());

  test("stays the same size across consecutive CI re-merges", () => {
    let r = runFi(["--add", "feature-a", "feature-b"], sb.work, ciEnv(100));
    assert.equal(r.status, 0, r.stderr);

    let length: number | undefined;
    for (let build = 101; build <= 106; build++) {
      r = runFi(["--again"], sb.work, ciEnv(build));
      assert.equal(r.status, 0, r.stderr);
      const msg = fiMessage(sb);
      assert.equal(msg, `${buildLine(build)}\n\n${BOTH_SIGNATURE}`);
      length ??= msg.length;
      assert.equal(msg.length, length);
      assert.deepEqual(parseBranchList(msg, "main"), [
        "origin/feature-a",
        "origin/feature-b",
      ]);
    }
  });

  test("one re-merge replaces an already-bloated message", () => {
    let bloated = BOTH_SIGNATURE;
    for (let build = 1; build <= 50; build++) {
      bloated =
        `Re-merge fi branch triggered by build ${build} due to commit on feature-a. ` +
        `Was originally: --- ${bloated}\n\n${BOTH_SIGNATURE}`;
    }
    const tree = sb.git(["rev-parse", "origin/main^{tree}"]);
    const sha = sb.git(["commit-tree", tree, "-p", "origin/main", "-m", bloated]);
    sb.git(["push", "--quiet", "--force", "origin", `${sha}:refs/heads/fi`]);
    sb.git(["fetch", "--quiet", "origin"]);

    const r = runFi(["--again"], sb.work, ciEnv(51));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fiMessage(sb), `${buildLine(51)}\n\n${BOTH_SIGNATURE}`);
  });

  test("names what the operation changed, between the build line and the signature", () => {
    let r = runFi(["--add", "feature-a"], sb.work, ciEnv(300));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(
      fiMessage(sb),
      `${buildLine(300)}\n\nAdded feature-a.\n\n` +
        "Merge remote-tracking branch 'origin/feature-a' into fi"
    );

    sb.pushBranch("feature-c", "c.txt", "c\n");
    r = runFi(["--force", "feature-b", "feature-c"], sb.work, ciEnv(301));
    assert.equal(r.status, 0, r.stderr);
    const msg = fiMessage(sb);
    assert.equal(
      msg,
      `${buildLine(301)}\n\nAdded feature-b, feature-c; removed feature-a.\n\n` +
        "Merge remote-tracking branches 'origin/feature-b' and 'origin/feature-c' into fi"
    );
    assert.deepEqual(parseBranchList(msg, "main"), [
      "origin/feature-b",
      "origin/feature-c",
    ]);
  });

  test("a removed branch is named bare, so a whole-message scan cannot read it back", () => {
    let r = runFi(["--add", "feature-a", "feature-b"], sb.work, ciEnv(200));
    assert.equal(r.status, 0, r.stderr);
    r = runFi(["--remove", "feature-b"], sb.work, ciEnv(201));
    assert.equal(r.status, 0, r.stderr);

    let msg = fiMessage(sb);
    assert.match(msg, /^Removed feature-b\.$/m);
    assert.deepEqual(
      [...msg.matchAll(/'origin\/([^']+)'/g)].map((m) => m[1]),
      ["feature-a"]
    );

    r = runFi(["--again"], sb.work, ciEnv(202));
    assert.equal(r.status, 0, r.stderr);
    msg = fiMessage(sb);
    assert.doesNotMatch(msg, /feature-b/);
    assert.deepEqual(parseBranchList(msg, "main"), ["origin/feature-a"]);
  });

  test("outside CI, the change paragraph comes without a build line", () => {
    let r = runFi(["--add", "feature-a", "feature-b"], sb.work);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fiMessage(sb), `Added feature-a, feature-b.\n\n${BOTH_SIGNATURE}`);

    r = runFi(["--again"], sb.work);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fiMessage(sb), BOTH_SIGNATURE);
  });
});
