import type { Options } from "./types.js";
import {
  makeStyle,
  bulletList,
  createSpinner,
  abort,
} from "./style.js";
import {
  git,
  gitLines,
  gitExitCode,
  ensureFetched,
  defaultBranch,
  currentBranchName,
  isInteractive,
  type CommitFormat,
} from "./git.js";
import { confirm } from "./ui.js";
import { detectGitlabProject } from "./gitlab.js";

// Commit-message format written when bootstrapping a brand-new fi branch (no
// The format git-fi writes for *every* fi commit during the migration rollout
// — bootstrap, empty, or existing alike (BL-04); an existing fi branch's format
// is not preserved. git-fi still *reads* both the preferred terse format
// (BL-01) and the legacy git-merge format (BL-03) regardless of this setting.
// It stays "legacy" so downstream consumers that parse the fi commit message
// keep working; scheduled to switch to "terse" after the rollout (~2026-09).
const DEFAULT_WRITE_FORMAT: CommitFormat = "legacy";

function buildLegacyMessage(branches: string[]): string {
  const shortNames = branches.map((b) => b.replace(/^origin\//, ""));
  if (shortNames.length === 0) {
    return "Merge remote-tracking branch into fi";
  }
  const quoted = shortNames.map((b) => `'origin/${b}'`);
  if (quoted.length === 1) {
    return `Merge remote-tracking branch ${quoted[0]} into fi`;
  }
  const last = quoted.pop()!;
  return `Merge remote-tracking branches ${quoted.join(", ")} and ${last} into fi`;
}

function buildTerseSignature(branches: string[], defBranch: string): string {
  const baseHash = git(["rev-parse", "--short", `origin/${defBranch}`])!;
  const shortNames = branches.map((b) => b.replace(/^origin\//, ""));
  if (shortNames.length === 0) return `@[${baseHash}]`;
  return `(${shortNames.join(", ")})@[${baseHash}]`;
}

function buildCommitMessage(
  branches: string[],
  defBranch: string,
  format: CommitFormat
): string {
  if (process.env.CI) {
    const pipelineId = process.env.CI_PIPELINE_ID || "unknown";
    const refName = process.env.CI_COMMIT_REF_NAME || "unknown";
    const previousMsg =
      git(["log", "-1", "--format=%B", "origin/fi"], { allowFailure: true }) ||
      "";
    const signature = format === "legacy"
      ? buildLegacyMessage(branches)
      : buildTerseSignature(branches, defBranch);
    const preamble = `Re-merge fi branch triggered by build ${pipelineId} due to commit on ${refName}. Was originally: --- ${previousMsg.trim()}`;
    return `${preamble}\n\n${signature}`;
  }

  if (format === "legacy") return buildLegacyMessage(branches);
  return buildTerseSignature(branches, defBranch);
}

const ACTION_INITIAL: Record<string, string> = {
  add: "new",
  remove: "removing",
  force: "replacing",
  again: "re-merging",
  prune: "pruning",
};

const ACTION_DONE: Record<string, string> = {
  add: "added",
  remove: "removed",
  force: "replaced",
  again: "re-merged",
  prune: "pruned",
};

export async function mergeProcess(
  action: string,
  actionBranches: string[],
  allBranches: string[],
  opts: Options
): Promise<string | null> {
  const s = makeStyle(opts);
  const defBranch = defaultBranch();
  const gitlab = detectGitlabProject();
  const initialVerb = ACTION_INITIAL[action] || action;
  const doneVerb = ACTION_DONE[action] || action;
  const actionSet = new Set(actionBranches);
  const tty = process.stdout.isTTY === true;

  const fiRefs = gitLines([
    "for-each-ref",
    "--format=%(refname)",
    "refs/remotes/origin/fi",
  ]);
  if (fiRefs.length > 1) {
    abort("There is more than one origin/fi!", opts);
  }

  const statusOut = git(["status", "--porcelain"]);
  if (statusOut && statusOut.length > 0) {
    abort("Your index is dirty", opts);
  }

  const untrackedBefore = new Set(
    gitLines(["ls-files", "--other", "--exclude-standard"])
  );

  await ensureFetched(opts);

  const fiExistsAfterFetch = git(["rev-parse", "--verify", "origin/fi"], {
    allowFailure: true,
  });

  // During the rollout git-fi always writes the legacy format — bootstrap,
  // empty, or existing fi alike (BL-04). Reading still accepts both formats
  // (parseBranchList), so terse branches written by other versions are
  // understood; only the *written* format is pinned. Flip DEFAULT_WRITE_FORMAT
  // to switch everything to terse once downstream consumers are ready.
  const commitFormat: CommitFormat = DEFAULT_WRITE_FORMAT;

  if (fiExistsAfterFetch === null && !opts.yes) {
    if (!isInteractive(opts)) {
      abort(
        "Bootstrapping fi requires confirmation; re-run with --yes or from an interactive terminal.",
        opts
      );
    }
    const repoPath = process.cwd();
    const remoteUrl =
      git(["remote", "get-url", "origin"], { allowFailure: true }) || repoPath;

    const confirmed = await confirm(
      `Bootstrap ${repoPath} with ${s.fi()} capability?`,
      remoteUrl
    );
    if (!confirmed) {
      process.exit(1);
    }
  }

  // Filter dead and merged branches
  const deadBranches: string[] = [];
  const liveBranches: string[] = [];
  for (const b of allBranches) {
    if (git(["rev-parse", "--verify", b], { allowFailure: true }) === null) {
      deadBranches.push(b);
    } else {
      liveBranches.push(b);
    }
  }
  if (deadBranches.length > 0) {
    process.stderr.write(
      `${s.yellow("Ignoring branches that no longer exist:")}\n`
    );
    for (const b of deadBranches) {
      process.stderr.write(
        `  ${s.yellow(b.replace(/^origin\//, ""))}\n`
      );
    }
  }

  const mergeable: string[] = [];
  for (const b of liveBranches) {
    const isMerged = gitExitCode([
      "merge-base",
      "--is-ancestor",
      b,
      `origin/${defBranch}`,
    ]);
    if (isMerged === 0) {
      process.stderr.write(
        `${s.yellow(`${b.replace(/^origin\//, "")} already in ${defBranch}`)}\n`
      );
    } else {
      mergeable.push(b);
    }
  }

  // Build compact display
  interface AnnotationInfo {
    lineIndex: number;
    branch: string;
    baseLine: string;
  }
  const displayLines: string[] = [];
  const annotations: AnnotationInfo[] = [];

  for (const b of mergeable) {
    const name = b.replace(/^origin\//, "");
    const label = gitlab
      ? s.link(
          s.cyan(name),
          `https://${gitlab.host}/${gitlab.project}/-/tree/${encodeURIComponent(name)}`
        )
      : s.cyan(name);

    if (action === "add" && actionSet.has(b)) {
      const baseLine = ` ${s.dim("*")} ${label}`;
      displayLines.push(`${baseLine}  ${s.dim("<- " + initialVerb)}`);
      annotations.push({ lineIndex: displayLines.length - 1, branch: b, baseLine });
    } else {
      displayLines.push(` ${s.dim("*")} ${label}`);
    }
  }

  if (action === "remove") {
    for (const b of actionBranches) {
      const name = b.replace(/^origin\//, "");
      const baseLine = `   ${s.dim(name)}`;
      displayLines.push(`${baseLine}  ${s.dim("<- " + initialVerb)}`);
      annotations.push({ lineIndex: displayLines.length - 1, branch: b, baseLine });
    }
  }

  if (["again", "force", "prune"].includes(action) || annotations.length === 0) {
    const baseLine = "";
    displayLines.push(`${s.dim("<- " + initialVerb)}`);
    annotations.push({ lineIndex: displayLines.length - 1, branch: "", baseLine });
  }

  process.stdout.write(`${s.fi()}:\n`);
  for (const line of displayLines) {
    process.stdout.write(line + "\n");
  }

  // Cursor helpers for inline progress
  function rewriteAnnotation(ann: AnnotationInfo, content: string) {
    const linesUp = displayLines.length - ann.lineIndex;
    process.stdout.write(
      `\x1b[${linesUp}A\r\x1b[2K${content}\x1b[${linesUp}B\r`
    );
  }

  function updateAnnotation(ann: AnnotationInfo, status: string) {
    if (!tty) return;
    const prefix = ann.baseLine ? `${ann.baseLine}  ` : "";
    rewriteAnnotation(ann, `${prefix}${s.dim("<- " + status)}`);
  }

  function updateLastAnnotation(status: string) {
    if (!tty) return;
    const lastAnn = annotations[annotations.length - 1];
    if (!lastAnn) return;
    updateAnnotation(lastAnn, status);
  }

  function finalizeDone() {
    if (!tty || annotations.length === 0) {
      process.stderr.write(`${s.greenBold("Done!")}\n`);
      return;
    }
    for (const ann of annotations) {
      let highlighted: string;
      if (ann.branch) {
        const name = ann.branch.replace(/^origin\//, "");
        if (action === "remove") {
          highlighted = `   ${s.dim(name)}  ${s.dim("<-")} ${s.greenBold(doneVerb)}`;
        } else {
          const label = gitlab
            ? s.link(
                s.green(name),
                `https://${gitlab.host}/${gitlab.project}/-/tree/${encodeURIComponent(name)}`
              )
            : s.green(name);
          highlighted = ` ${s.dim("*")} ${label}  ${s.dim("<-")} ${s.greenBold(doneVerb)}`;
        }
      } else {
        highlighted = `${s.dim("<-")} ${s.greenBold(doneVerb)}`;
      }
      rewriteAnnotation(ann, highlighted);
    }
  }

  function finalizeError() {
    if (!tty) return;
    for (const ann of annotations) {
      let highlighted: string;
      if (ann.branch) {
        const name = ann.branch.replace(/^origin\//, "");
        if (action === "remove") {
          highlighted = `   ${s.dim(name)}  ${s.dim("<-")} ${s.redBold("failed")}`;
        } else {
          highlighted = ` ${s.dim("*")} ${s.redBold(name)}  ${s.dim("<-")} ${s.redBold("failed")}`;
        }
      } else {
        highlighted = `${s.dim("<-")} ${s.redBold("failed")}`;
      }
      rewriteAnnotation(ann, highlighted);
    }
  }

  const originalBranch = currentBranchName() || git(["rev-parse", "HEAD"])!;

  if (mergeable.length === 0) {
    let pushedSha: string | null = null;
    try {
      git(["checkout", "--quiet", "-B", "fi", `origin/${defBranch}`], {
        debug: opts.debug,
      });
      const commitMsg = buildCommitMessage([], defBranch, commitFormat);

      updateLastAnnotation("committing");
      git(
        [
          "commit",
          "--no-verify",
          "--allow-empty-message",
          "--allow-empty",
          "--quiet",
          "--no-edit",
          "-m",
          commitMsg,
        ],
        { debug: opts.debug }
      );

      updateLastAnnotation("pushing");
      pushedSha = git(["rev-parse", "HEAD"]);
      git(["push", "--no-verify", "-f", "origin", "fi"], {
        debug: opts.debug,
      });
    } finally {
      git(["checkout", "--quiet", originalBranch], {
        allowFailure: true,
        debug: opts.debug,
      });
      git(["branch", "--quiet", "-D", "fi"], {
        allowFailure: true,
        debug: opts.debug,
      });
    }

    finalizeDone();
    return pushedSha;
  }

  try {
    git(["checkout", "--quiet", "-B", "fi", `origin/${defBranch}`], {
      debug: opts.debug,
    });
  } catch {
    abort(`Failed to checkout fi from origin/${defBranch}`, opts);
  }

  let mergeSuccess = false;
  updateLastAnnotation("merging");
  const mergeSpin = createSpinner(
    `Merging ${mergeable.length} branches...`,
    opts
  );
  try {
    const mergeArgs = [
      "merge",
      "--no-commit",
      "--no-ff",
      "--no-edit",
      ...mergeable,
    ];
    if (!opts.debug) mergeArgs.splice(1, 0, "--quiet");
    git(mergeArgs, { debug: opts.debug });
    mergeSuccess = true;
  } catch {
    mergeSuccess = false;
  } finally {
    mergeSpin.stop();
  }

  if (mergeSuccess) {
    updateLastAnnotation("committing");
    const commitMsg = buildCommitMessage(mergeable, defBranch, commitFormat);
    git(
      [
        "commit",
        "--no-verify",
        "--allow-empty-message",
        "--allow-empty",
        "--quiet",
        "--no-edit",
        "-m",
        commitMsg,
      ],
      { debug: opts.debug }
    );

    updateLastAnnotation("pushing");
    const pushedSha = git(["rev-parse", "HEAD"]);
    git(["push", "--no-verify", "-f", "origin", "fi"], {
      debug: opts.debug,
    });

    git(["checkout", "--quiet", originalBranch], {
      allowFailure: true,
      debug: opts.debug,
    });
    git(["branch", "--quiet", "-D", "fi"], {
      allowFailure: true,
      debug: opts.debug,
    });

    finalizeDone();
    return pushedSha;
  } else {
    const conflictFiles =
      gitLines(["diff", "--name-only", "--diff-filter=U"], {
        allowFailure: true,
      }) || [];

    git(["reset", "--hard", "HEAD"], { debug: opts.debug });

    const untrackedAfter = gitLines([
      "ls-files",
      "--other",
      "--exclude-standard",
    ]);
    const newUntracked = untrackedAfter.filter(
      (f) => !untrackedBefore.has(f)
    );

    git(["checkout", "--quiet", originalBranch], {
      allowFailure: true,
      debug: opts.debug,
    });
    git(["branch", "--quiet", "-D", "fi"], {
      allowFailure: true,
      debug: opts.debug,
    });

    finalizeError();

    process.stdout.write("\nFailed trying to merge branch(es):\n\n");
    process.stdout.write(bulletList(mergeable, opts));

    if (newUntracked.length > 0) {
      process.stdout.write(
        "\nSome extra untracked files have been left as a result of the failed merge(s):\n\n"
      );
      process.stdout.write(bulletList(newUntracked, opts));
      process.stdout.write("\nYou can delete these by running:\n");
      for (const f of newUntracked) {
        process.stdout.write(`  rm "${f}"\n`);
      }
    }

    process.stdout.write("\n");
    abort("Aborted due to merge failures", opts);
  }
}
