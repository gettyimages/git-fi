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
  ensureFetched,
  defaultBranch,
  existingRemoteRefs,
  localDivergence,
  mergedRemoteBranches,
  branchReadiness,
  branchAuthors,
  currentFiBranches,
  isInteractive,
  signCommits,
  type CommitFormat,
} from "./git.js";
import { localBranchName, remoteRef } from "./branches.js";
import { confirm } from "./ui.js";
import { detectGitlabProject } from "./gitlab.js";
import {
  mergeBranches,
  renderConflicts,
  OID,
  type MergeOutcome,
} from "./readiness.js";
import { branchJson, writeJson } from "./json.js";

// Commit-message format written when bootstrapping a brand-new fi branch (no
// The format git-fi writes for *every* fi commit during the migration rollout
// — bootstrap, empty, or existing alike (STORAGE-04); an existing fi branch's format
// is not preserved. git-fi still *reads* both the preferred terse format
// (STORAGE-01) and the legacy git-merge format (STORAGE-03) regardless of this setting.
// It stays "legacy" so downstream consumers that parse the fi commit message
// keep working; scheduled to switch to "terse" after the rollout (~2026-09).
const DEFAULT_WRITE_FORMAT: CommitFormat = "legacy";

function buildLegacyMessage(branches: string[]): string {
  const shortNames = branches.map(localBranchName);
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
  const shortNames = branches.map(localBranchName);
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
};

const ACTION_DONE: Record<string, string> = {
  add: "added",
  remove: "removed",
  force: "replaced",
  again: "re-merged",
};

// The same verbs as a standalone sentence, for the one-line outcome printed
// where the annotations cannot be animated (TERM-09). `added` alone would read
// as though fi were the thing added, so each verb carries its preposition.
const ACTION_OUTCOME: Record<string, string> = {
  add: "added to",
  remove: "removed from",
  force: "replaced",
  again: "re-merged",
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

  // Under --bare / --json, stdout carries machine output only (JSON-01), so
  // failure diagnostics move to stderr. In human mode they stay on stdout.
  const machineOutput = opts.bare || opts.json;
  const diagnose = (text: string) => {
    (machineOutput ? process.stderr : process.stdout).write(text);
  };
  // The branch display exists to be rewritten in place as the operation
  // progresses, so it is drawn only where that can happen: an interactive
  // stdout, and not under a machine format (TERM-07, JSON-01).
  const tty = process.stdout.isTTY === true && !machineOutput;

  const fiRefs = gitLines([
    "for-each-ref",
    "--format=%(refname)",
    "refs/remotes/origin/fi",
  ]);
  if (fiRefs.length > 1) {
    abort("There is more than one origin/fi!", opts);
  }

  await ensureFetched(opts);

  const fiExistsAfterFetch = git(["rev-parse", "--verify", "origin/fi"], {
    allowFailure: true,
  });

  // During the rollout git-fi always writes the legacy format — bootstrap,
  // empty, or existing fi alike (STORAGE-04). Reading still accepts both formats
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

  const existingRefs = existingRemoteRefs();
  const deadBranches = allBranches.filter((b) => !existingRefs.has(b));
  const liveBranches = allBranches.filter((b) => existingRefs.has(b));
  if (deadBranches.length > 0) {
    process.stderr.write(
      `${s.yellow("Ignoring branches that no longer exist:")}\n`
    );
    for (const b of deadBranches) {
      process.stderr.write(
        `  ${s.yellow(localBranchName(b))}\n`
      );
    }
  }

  const alreadyMerged = mergedRemoteBranches(defBranch);
  const mergeable: string[] = [];
  for (const b of liveBranches) {
    if (alreadyMerged.has(b)) {
      process.stderr.write(
        `${s.yellow(`${localBranchName(b)} already in ${defBranch}`)}\n`
      );
    } else {
      mergeable.push(b);
    }
  }

  // The merge takes origin/<branch> and never the caller's checkout, so a local
  // branch that has drifted from it means fi holds something other than what
  // the caller is looking at (READY-08). Only the branches this action names
  // are checked: over the whole list, `--again` would warn about every stale
  // local copy of a teammate's branch, which says nothing about the command
  // that was run.
  for (const b of mergeable) {
    if (!actionSet.has(b)) continue;
    const drift = localDivergence(b);
    if (drift === null || (drift.ahead === 0 && drift.behind === 0)) continue;
    const name = localBranchName(b);
    const counts = [
      drift.ahead > 0 ? `${drift.ahead} ahead` : "",
      drift.behind > 0 ? `${drift.behind} behind` : "",
    ].filter(Boolean);
    process.stderr.write(
      `${s.yellow(`${s.fi()} merges origin/${name}, and your ${name} is ${counts.join(", ")}`)}\n`
    );
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
    const name = localBranchName(b);
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
      const name = localBranchName(b);
      const baseLine = `   ${s.dim(name)}`;
      displayLines.push(`${baseLine}  ${s.dim("<- " + initialVerb)}`);
      annotations.push({ lineIndex: displayLines.length - 1, branch: b, baseLine });
    }
  }

  if (["again", "force"].includes(action) || annotations.length === 0) {
    const baseLine = "";
    displayLines.push(`${s.dim("<- " + initialVerb)}`);
    annotations.push({ lineIndex: displayLines.length - 1, branch: "", baseLine });
  }

  // Printed once, up front, only because the annotations are about to be
  // rewritten into it. Off a TTY those rewrites never happen, so printing it
  // would leave the *initial* verb ("re-merging") standing as the log's last
  // word on the outcome, above a branch list the table already carries.
  if (tty) {
    process.stdout.write(`${s.fi()}:\n`);
    for (const line of displayLines) {
      process.stdout.write(line + "\n");
    }
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
      // The outcome as one sentence (TERM-09), since no annotation was drawn to
      // finalize. Human mode puts it on stdout, alongside the branch list that
      // follows: two streams into one pipe have no ordering guarantee, so from
      // stderr it could surface mid-table.
      const verb = ACTION_OUTCOME[action] || doneVerb;
      diagnose(`${s.greenBold(verb)} ${s.fi()}\n`);
      return;
    }
    for (const ann of annotations) {
      let highlighted: string;
      if (ann.branch) {
        const name = localBranchName(ann.branch);
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
        const name = localBranchName(ann.branch);
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

  // An empty list still produces a commit, fi rebuilt at the default branch, so
  // it walks nothing rather than taking a path of its own. The spinner is what
  // does not carry over: there is no merge for it to describe.
  let mergeSpin = null;
  if (mergeable.length > 0) {
    updateLastAnnotation("merging");
    mergeSpin = createSpinner(`Merging ${mergeable.length} branches...`, opts);
  }
  let outcome: MergeOutcome;
  try {
    outcome = mergeBranches(mergeable, defBranch);
  } finally {
    mergeSpin?.stop();
  }

  if (outcome.outcome === "merged") {
    updateLastAnnotation("committing");
    const commitMsg = buildCommitMessage(mergeable, defBranch, commitFormat);
    // The parents a merge commit carries: the default branch fi is rebuilt
    // from, then each branch in the order it was merged.
    const parents = [defBranch, ...mergeable].flatMap((p) => [
      "-p",
      remoteRef(p),
    ]);
    // commit-tree ignores commit.gpgsign where `git commit` honors it, so
    // without this a repo that signs its commits would have fi silently stop
    // being signed — and a forge that rejects unsigned commits would refuse the
    // push with nothing saying why (MERGE-10).
    const sign = signCommits() ? ["-S"] : [];
    const pushedSha = git(
      ["commit-tree", outcome.tree, ...parents, ...sign, "-m", commitMsg],
      { debug: opts.debug }
    );

    // An empty left side makes `:refs/heads/fi` a delete refspec, and it would
    // run with `-f` against the branch everyone shares. commit-tree throws
    // rather than returning empty today, so this is what keeps that true.
    if (pushedSha === null || !OID.test(pushedSha)) {
      abort(
        `Refusing to push: commit-tree did not name a commit (${pushedSha ?? "null"})`,
        opts
      );
    }

    updateLastAnnotation("pushing");
    // The commit is reachable from nothing local, so it is named by sha. A push
    // still moves refs/remotes/origin/fi, which is what the branch list printed
    // after this reads.
    git(["push", "--no-verify", "-f", "origin", `${pushedSha}:refs/heads/fi`], {
      debug: opts.debug,
    });

    finalizeDone();
    return pushedSha;
  }

  finalizeError();

  // Nothing was pushed, so fi still holds what it held before the attempt, which
  // is what says whether `-r` is a remedy for a given branch, and what `--json`
  // reports below as fi's branch list.
  const fiNow = currentFiBranches(defBranch);
  const inFi = new Set(fiNow.map(localBranchName));

  diagnose("\nFailed trying to merge branch(es):\n\n");
  // Naming the whole failing set invites `--force` (replace fi with one branch
  // and start over) when the fix is usually one or two rebases (READY-05).
  if (outcome.outcome === "conflict") {
    diagnose(renderConflicts(outcome.conflicts, defBranch, inFi, opts));
  } else {
    diagnose(bulletList(mergeable, opts));
    // Saying which branch failed is the promise this path makes, so when it
    // cannot be kept the report says that rather than leaving a bare list that
    // reads as the old behavior.
    diagnose(
      "\nThe merge could not run, so nothing above names the branch at fault.\nRe-run with --debug to see what git reported.\n"
    );
  }

  diagnose("\n");

  // The abort below exits non-zero, so this is the only object `--json` will
  // ever write for a failed merge (JSON-03). A pipeline that stops on the exit
  // code should not have to scrape stderr to learn which branch needs rebasing.
  //
  // `branches` is fi as it stands, which the failed merge left untouched: the
  // same thing it means after every action that succeeded. What was tried is a
  // different list, so it gets a different name.
  if (opts.json) {
    const readiness = branchReadiness(defBranch);
    const authors = branchAuthors(defBranch);
    await writeJson({
      command: action,
      branches: fiNow.map((b) => branchJson(b, readiness)),
      attempted: mergeable.map(localBranchName),
      conflicts:
        outcome.outcome === "conflict"
          ? outcome.conflicts.map(({ branch, with: w, paths }) => ({
              branch,
              author: authors.get(`origin/${branch}`) ?? null,
              with: w,
              paths,
            }))
          : [],
    });
  }

  abort("Aborted due to merge failures", opts);
}
