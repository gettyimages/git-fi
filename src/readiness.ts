import type { Options } from "./types.js";
import { makeStyle, shq, quoteCStyle } from "./style.js";
import {
  git,
  gitOutcome,
  branchAuthors,
  quotePathEnabled,
} from "./git.js";
import { localBranchName, remoteRef } from "./branches.js";

/** A branch that could not be merged, and what stopped it (READY-03). */
export interface BranchConflict {
  /** The branch, without the `origin/` prefix, as the report and the JSON carry it. */
  branch: string;
  /** What it conflicts with: the default branch, or peer branches, unprefixed. */
  with: string[];
  /** Paths merge-tree reported as conflicted. */
  paths: string[];
}

/**
 * What the merge (MERGE-08) made of a branch list: the tree every branch
 * integrated into, the branches that stopped it, or nothing at all when a
 * probe could not run: an unresolvable ref, or a shallow clone whose
 * histories look unrelated.
 */
export type MergeOutcome =
  | { outcome: "merged"; tree: string }
  | { outcome: "conflict"; conflicts: BranchConflict[] }
  | { outcome: "error" };

type MergeTreeResult =
  | { outcome: "merged"; tree: string }
  | { outcome: "conflict"; paths: string[] }
  | { outcome: "error" };

// 40 hex for SHA-1, 64 for a SHA-256 repository.
export const OID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

// merge-tree writes the tree OID, then (with --name-only) the conflicted paths,
// then an empty field and the human-readable "CONFLICT ..." block. `-z` makes
// those separators NUL, which is what keeps a path with a newline or a
// non-ASCII byte intact: without it git C-quotes the path, and the quoted form
// matches nothing on disk.
function mergeTree(base: string, other: string): MergeTreeResult {
  const { status, out } = gitOutcome([
    "merge-tree",
    "--write-tree",
    "--name-only",
    "-z",
    base,
    other,
  ]);
  const fields = out.split("\0");
  const tree = fields[0] ?? "";
  // Exit 1 means a conflict *or* an error — an unresolvable ref and a shallow
  // clone's unrelated histories both take it, writing nothing to stdout. The
  // tree OID is what separates them: a conflict always writes one.
  if (!OID.test(tree)) return { outcome: "error" };
  if (status === 0) return { outcome: "merged", tree };

  const paths: string[] = [];
  for (const field of fields.slice(1)) {
    if (field === "") break;
    paths.push(field);
  }
  return { outcome: "conflict", paths };
}

// Each clean step of the walk, so the next branch has a commit to merge onto.
// The identity is pinned rather than read from config: in a repo with no
// user.email set, reading it would turn a merge conflict into an unrelated
// commit-tree error before the report naming the branch could be written. The
// fi commit itself is the caller's, and takes only the tree from here. Nothing
// references these, so gc reclaims them.
function commitTree(tree: string, parents: string[]): string {
  const args = [
    "-c",
    "user.name=git-fi",
    "-c",
    "user.email=git-fi@invalid",
    "commit-tree",
    tree,
  ];
  for (const p of parents) args.push("-p", p);
  args.push("-m", "git-fi merge step");
  return git(args) ?? "";
}

/**
 * Merge `branches` incrementally onto the default branch in the object database
 * and report what each failing branch conflicts with (MERGE-02, MERGE-08,
 * READY-03, READY-06).
 *
 * The merge and the attribution are one traversal: a clean walk yields the tree
 * to commit, and a failing branch is left out of the accumulated set so one bad
 * branch does not condemn every branch listed after it.
 */
export function mergeBranches(
  branches: string[],
  defBranch: string
): MergeOutcome {
  const base = remoteRef(defBranch);
  const conflicts: BranchConflict[] = [];
  let accumulated = base;
  const merged: string[] = [];

  // A probe that could not run says nothing about the branch it was measuring,
  // and every branch after it would be measured against a set that branch
  // should have joined, so the walk stops. Branches already attributed are
  // still the honest answer for themselves, and reporting them beats the bare
  // "nothing above names the branch at fault" this used to fall back to.
  const giveUp = (): MergeOutcome =>
    conflicts.length > 0 ? { outcome: "conflict", conflicts } : { outcome: "error" };

  for (const branch of branches) {
    const ref = remoteRef(branch);
    const result = mergeTree(accumulated, ref);
    if (result.outcome === "error") return giveUp();
    if (result.outcome === "merged") {
      accumulated = commitTree(result.tree, [accumulated, ref]);
      merged.push(branch);
      continue;
    }

    // Against the default branch alone the accumulated set is out of the
    // picture, which is what separates "this branch needs a rebase" from "these
    // two branches overlap".
    const vsDefault = accumulated === base ? result : mergeTree(base, ref);
    if (vsDefault.outcome === "error") return giveUp();
    if (vsDefault.outcome === "conflict") {
      conflicts.push({
        branch: localBranchName(branch),
        with: [defBranch],
        paths: vsDefault.paths,
      });
      continue;
    }

    const peers: string[] = [];
    for (const peer of merged) {
      const vsPeer = mergeTree(remoteRef(peer), ref);
      // An unrun probe read as "this peer is fine" empties the sweep, and the
      // fallback below then reports a combination-only failure: the confident
      // wrong answer, where the two probes above say nothing instead.
      if (vsPeer.outcome === "error") return giveUp();
      if (vsPeer.outcome === "conflict") peers.push(peer);
    }
    conflicts.push({
      branch: localBranchName(branch),
      // A peer sweep can come up empty when the conflict only appears in the
      // combination — say the branch to add against the merge of two others.
      // Naming the set is the honest answer there.
      with: (peers.length > 0 ? peers : merged).map(localBranchName),
      paths: result.paths,
    });
  }

  if (conflicts.length > 0) return { outcome: "conflict", conflicts };
  // An empty branch list never enters the loop, so the accumulator is still the
  // default branch, and its tree is what fi is rebuilt to hold. That is also
  // the one read here that can fail on a ref the walk never resolved, so it
  // degrades into the same "could not run" the loop reports rather than
  // throwing a raw command failure out of the top level.
  const tree = git(["rev-parse", `${accumulated}^{tree}`], {
    allowFailure: true,
  });
  if (tree === null) return { outcome: "error" };
  return { outcome: "merged", tree };
}

// Enough paths to recognize what the branches are fighting over, without a wall
// of them when the conflict is a rename or a generated file. The remainder is
// counted rather than dropped silently.
const PATHS_SHOWN = 5;

/** The conflicted paths as list items — a list of one is still a list. */
function pathItems(paths: string[], opts: Options): string[] {
  const s = makeStyle(opts);
  const shown = paths.slice(0, PATHS_SHOWN);
  const rest = paths.length - shown.length;
  const quote = quotePathEnabled();
  const items = shown.map((p) => `     ${s.dim("*")} ${quoteCStyle(p, quote)}`);
  if (rest > 0) items.push(`     ${s.dim(`* +${rest} more`)}`);
  return items;
}

/**
 * The failing branches with the remedy each one calls for (READY-04). `--force`
 * is deliberately absent: replacing fi with one branch discards the other
 * branches' integration instead of resolving anything, and naming the pair is
 * what makes the smaller fix — one or two rebases — visible.
 */
export function renderConflicts(
  conflicts: BranchConflict[],
  defBranch: string,
  inFi: Set<string>,
  opts: Options
): string {
  const s = makeStyle(opts);
  const authors = branchAuthors(defBranch);
  const lines: string[] = [];

  // Each branch carries its tip author, so the line says who owns the rebase
  // rather than leaving the reader to work out whose branch it is. The default
  // branch is nobody's to rebase, so it is named bare.
  const owned = (name: string): string => {
    const email = authors.get(`origin/${name}`);
    return email ? `${name} (${email})` : name;
  };

  for (const c of conflicts) {
    const against = c.with
      .map((w) => (w === defBranch ? w : owned(w)))
      .join(", ");
    lines.push(
      ` ${s.dim("*")} ${s.cyan(owned(c.branch))}  ${s.redBold(`conflicts with ${against}`)}`
    );
    lines.push(...pathItems(c.paths, opts));

    if (c.with.length === 1 && c.with[0] === defBranch) {
      lines.push(
        `     ${s.bold(`git checkout ${shq(c.branch)} && git rebase origin/${shq(defBranch)} && git push --force-with-lease`)}`
      );
    } else {
      const peers = c.with.join(" or ");
      lines.push(
        `     ${s.dim(`rebase ${c.branch} onto ${peers} (or the reverse) and settle the overlap there`)}`
      );
    }
  }

  // The escape hatch, below the fixes and marked temporary: -r takes out only
  // the named branches, so unlike -f the rest of fi survives. It defers the
  // conflict rather than resolving it, which is why it is not offered first.
  //
  // A branch that failed on the way *in* was never added, so there is nothing
  // to remove and the line is only offered for the ones fi actually holds.
  const removable = conflicts
    .map((c) => c.branch)
    .filter((name) => inFi.has(name));
  if (removable.length > 0) {
    lines.push("");
    lines.push(
      s.dim("Or temporarily remove them from fi — the conflict comes back when they do:")
    );
    lines.push(`  ${s.bold(`git fi -r ${removable.map(shq).join(" ")}`)}`);
  }

  return lines.join("\n") + "\n";
}
