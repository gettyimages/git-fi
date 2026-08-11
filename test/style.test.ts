import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  colorEnabled,
  hintsEnabled,
  hyperlinksEnabled,
  makeStyle,
  strikeIfMerged,
  withReadiness,
} from "../src/style.ts";
import type { Options } from "../src/types.ts";
import type { BranchReadiness } from "../src/types.ts";

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

// The `tty` argument is what makes the drawn rendering testable: the suite runs
// off a terminal, so without it only the worded arm is ever reachable.
describe("readiness rendering (READY-02, READY-07)", () => {
  const behind = (n: number | null): BranchReadiness => ({
    ahead: 3,
    behind: n,
    merged: false,
  });
  const landed: BranchReadiness = { ahead: 0, behind: 14, merged: true };

  test("a trailing branch carries the arrow where it will be drawn", () => {
    withEnv({ NO_COLOR: undefined }, () => {
      assert.equal(
        withReadiness("feature-a", behind(12), OPTS, true).replace(/\x1b\[[0-9;]*m/g, ""),
        "feature-a ↓12"
      );
    });
  });

  test("and the word where it will not (TERM-10)", () => {
    assert.equal(withReadiness("feature-a", behind(12), OPTS, false), "feature-a behind 12");
  });

  test("a branch level with the default branch carries nothing", () => {
    assert.equal(withReadiness("feature-a", behind(0), OPTS, false), "feature-a");
  });

  test("an unknown count is not a zero — no marker, and nothing invented", () => {
    // Null is what a shallow clone and a missing origin/<default> both produce.
    assert.equal(withReadiness("feature-a", behind(null), OPTS, false), "feature-a");
  });

  test("a branch git-fi knows nothing about carries nothing", () => {
    assert.equal(withReadiness("feature-a", undefined, OPTS, false), "feature-a");
  });

  test("merged supersedes the behind count rather than stacking with it", () => {
    assert.equal(withReadiness("bugfix-nav", landed, OPTS, false), "bugfix-nav merged");
    assert.doesNotMatch(withReadiness("bugfix-nav", landed, OPTS, false), /behind/);
  });

  test("a landed name is struck, and the word rides along for terminals that will not draw it", () => {
    withEnv({ NO_COLOR: undefined }, () => {
      assert.equal(strikeIfMerged("bugfix-nav", landed, OPTS, true), "\x1b[9mbugfix-nav\x1b[29m");
    });
    // SGR 29 rather than a full reset, so the strike can sit inside a color or
    // hyperlink span without closing it.
    assert.equal(strikeIfMerged("bugfix-nav", landed, OPTS, false), "bugfix-nav");
    assert.equal(strikeIfMerged("feature-a", behind(12), OPTS, true), "feature-a");
  });
});
