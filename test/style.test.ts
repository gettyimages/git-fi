import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { colorEnabled, hintsEnabled, hyperlinksEnabled, makeStyle } from "../src/style.ts";
import type { Options } from "../src/types.ts";

const OPTS: Options = { debug: false, bare: false, json: false, select: false, yes: false };

/** Run `fn` with `vars` applied to the environment, then restore it. */
function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// The TTY argument is what makes these testable: every condition below only
// distinguishes itself on a terminal, and the suite never runs on one.
describe("hintsEnabled (LIST-04, UPDATE-03)", () => {
  test("on at an interactive terminal with nothing opting out", () => {
    withEnv({ CI: undefined, GIT_FI_NO_HINTS: undefined }, () => {
      assert.equal(hintsEnabled(OPTS, true), true);
    });
  });

  test("off under $CI — the git-fi-runner case", () => {
    withEnv({ CI: "true", GIT_FI_NO_HINTS: undefined }, () => {
      assert.equal(hintsEnabled(OPTS, true), false);
    });
  });

  test("off in a pipe, where no reader can act on the advice", () => {
    withEnv({ CI: undefined, GIT_FI_NO_HINTS: undefined }, () => {
      assert.equal(hintsEnabled(OPTS, false), false);
    });
  });

  test("off on the explicit opt-out", () => {
    withEnv({ CI: undefined, GIT_FI_NO_HINTS: "1" }, () => {
      assert.equal(hintsEnabled(OPTS, true), false);
    });
  });

  test("off in machine-output modes", () => {
    withEnv({ CI: undefined, GIT_FI_NO_HINTS: undefined }, () => {
      assert.equal(hintsEnabled({ ...OPTS, bare: true }, true), false);
      assert.equal(hintsEnabled({ ...OPTS, json: true }, true), false);
    });
  });
});

describe("hyperlinksEnabled (GITLAB-04)", () => {
  test("NO_COLOR drops the color but keeps the links", () => {
    // The distinction the two predicates exist to draw: no-color.org governs
    // color, and says nothing about whether a reference stays clickable.
    withEnv({ NO_COLOR: "1" }, () => {
      assert.equal(colorEnabled(OPTS), false);
      assert.equal(hyperlinksEnabled(OPTS, true), true);
    });
  });

  test("off a TTY there is nothing to render the escape sequence", () => {
    assert.equal(hyperlinksEnabled(OPTS, false), false);
  });

  test("off in machine-output modes", () => {
    assert.equal(hyperlinksEnabled({ ...OPTS, bare: true }, true), false);
    assert.equal(hyperlinksEnabled({ ...OPTS, json: true }, true), false);
  });
});

// The suite runs off a TTY, so these are the CI-log renderings (GITLAB-09).
describe("link rendering", () => {
  const compare = "https://gitlab.example.com/group/proj/-/compare/main...feature-a";
  const s = makeStyle(OPTS);

  test("linkOrMarkdown writes the address out, which an escape sequence would lose", () => {
    assert.equal(s.linkOrMarkdown("feature-a", compare), `[feature-a](${compare})`);
    assert.doesNotMatch(s.linkOrMarkdown("feature-a", compare), /\x1b\]8;;/);
  });

  test("the fallback pastes into Slack or an issue as a live link", () => {
    // The reason it is markdown and not `text (url)`: a line lifted out of a
    // build log keeps working wherever it lands.
    assert.equal(s.linkOrMarkdown("feat/oauth", compare), `[feat/oauth](${compare})`);
  });

  test("link drops to plain text, keeping the table narrow", () => {
    assert.equal(s.link("1284412", "https://gitlab.example.com/group/proj/-/pipelines/1284412"), "1284412");
  });
});
