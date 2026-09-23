import type { Options } from "./types.js";
import { makeStyle, shq, quoteCStyle } from "./style.js";
import {
  git,
  gitOutcome,
  branchAuthors,
  quotePathEnabled,
  userEmail,
  type Author,
} from "./git.js";
import { localBranchName, remoteRef } from "./branches.js";
import { detectGitlabProject } from "./gitlab.js";

/** A branch that could not be merged, and what stopped it (READY-03). */
export interface BranchConflict {
  /** The branch, without the `origin/` prefix, as the report and the JSON carry it. */
  branch: string;
  /** What it conflicts with: the default branch, or peer branches, unprefixed. */
  with: string[];
  /** Paths merge-tree reported as conflicted. */
  paths: string[];
  /** Which probe named `with`: the default branch, single peers, or only their combination. */
  kind: "default" | "peer" | "combination";
  /** The first conflicted hunk, diff3 style, where a conflicted file carries markers. */
  chunk?: ConflictChunk;
}

export interface ConflictChunk {
  path: string;
  lines: string[];
  /** Lines past the cap, counted rather than dropped silently. */
  more: number;
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
  | { outcome: "conflict"; tree: string; paths: string[] }
  | { outcome: "error" };

// 40 hex for SHA-1, 64 for a SHA-256 repository.
export const OID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

// merge-tree writes the tree OID, then (with --name-only) the conflicted paths,
// then an empty field and the human-readable "CONFLICT ..." block. `-z` makes
// those separators NUL, which is what keeps a path with a newline or a
// non-ASCII byte intact: without it git C-quotes the path, and the quoted form
// matches nothing on disk.
function mergeTree(base: string, other: string): MergeTreeResult {
  // diff3 puts the merge base's version between the two sides, so a conflicted
  // hunk shows what each branch changed rather than only where they ended up.
  const { status, out } = gitOutcome([
    "-c",
    "merge.conflictStyle=diff3",
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
  return { outcome: "conflict", tree, paths };
}

// Enough of a hunk for authors who know the code to recognize it; the preview
// is a cue for the conversation, not the resolution.
const CHUNK_LINES = 20;

// Tabs survive; every other control is stripped, since a file's bytes printed
// raw could repaint the terminal the same way an author's email could.
function sanitizeLine(line: string): string {
  return line.replace(/[\x00-\x08\x0a-\x1f\x7f-\x9f]/g, "");
}

/**
 * The first conflicted hunk in the tree a failed merge-tree wrote. That tree
 * carries git's conflict markers in each conflicted file, so this reads it with
 * no checkout. A conflict with no markers — binary, modify/delete, rename —
 * has no hunk to show, and the next path is tried.
 */
function firstChunk(tree: string, paths: string[]): ConflictChunk | undefined {
  for (const path of paths) {
    const blob = git(["cat-file", "blob", `${tree}:${path}`], { allowFailure: true });
    if (blob === null) continue;
    const lines = blob.split("\n");
    const start = lines.findIndex((l) => l.startsWith("<<<<<<< "));
    if (start < 0) continue;
    const end = lines.findIndex((l, i) => i > start && l.startsWith(">>>>>>> "));
    if (end < 0) continue;
    // The markers carry the refs as merge-tree was given them; `origin/x` is
    // the name the reader knows.
    const hunk = lines
      .slice(start, end + 1)
      .map((l) => sanitizeLine(l).replace(/^(<{7}|>{7}) refs\/remotes\//, "$1 "));
    return {
      path,
      lines: hunk.slice(0, CHUNK_LINES),
      more: Math.max(0, hunk.length - CHUNK_LINES),
    };
  }
  return undefined;
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
        kind: "default",
        chunk: firstChunk(vsDefault.tree, vsDefault.paths),
      });
      continue;
    }

    const peers: string[] = [];
    let firstPeerConflict: MergeTreeResult | null = null;
    for (const peer of merged) {
      const vsPeer = mergeTree(remoteRef(peer), ref);
      // An unrun probe read as "this peer is fine" empties the sweep, and the
      // fallback below then reports a combination-only failure: the confident
      // wrong answer, where the two probes above say nothing instead.
      if (vsPeer.outcome === "error") return giveUp();
      if (vsPeer.outcome === "conflict") {
        peers.push(peer);
        firstPeerConflict ??= vsPeer;
      }
    }
    // A peer sweep can come up empty when the conflict only appears in the
    // combination — say the branch to add against the merge of two others.
    // Naming the set is the honest answer there.
    const shown = firstPeerConflict?.outcome === "conflict" ? firstPeerConflict : result;
    conflicts.push({
      branch: localBranchName(branch),
      with: (peers.length > 0 ? peers : merged).map(localBranchName),
      paths: result.paths,
      kind: peers.length > 0 ? "peer" : "combination",
      chunk: firstChunk(shown.tree, shown.paths),
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

// Sets the closing -r line apart from the messages, which run long enough that
// a command straight after the last one reads as part of it.
const RULE_WIDTH = 40;

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
 * Most cleared first: a branch several failures collide with is one
 * conversation that clears all of them, so its entries lead, grouped together.
 * The sort is stable, so equal weights keep the merge's own order.
 */
function byMostCleared(conflicts: BranchConflict[], defBranch: string): BranchConflict[] {
  const named = new Map<string, number>();
  for (const c of conflicts) {
    for (const w of c.with) {
      if (w !== defBranch) named.set(w, (named.get(w) ?? 0) + 1);
    }
  }
  const hub = (c: BranchConflict): string =>
    c.with.reduce((best, w) => ((named.get(w) ?? 0) > (named.get(best) ?? 0) ? w : best), c.branch);
  const weight = (c: BranchConflict): number => Math.max(1, named.get(hub(c)) ?? 0);
  const firstSeen = new Map<string, number>();
  conflicts.forEach((c, i) => {
    if (!firstSeen.has(hub(c))) firstSeen.set(hub(c), i);
  });
  return [...conflicts].sort(
    (a, b) => weight(b) - weight(a) || firstSeen.get(hub(a))! - firstSeen.get(hub(b))!
  );
}

/**
 * The failing branches, each with a message for the authors who can fix it
 * (READY-04). The authors of the conflicting branches are the ones who resolve it, so the
 * output hands the reader something to send them rather than a command that
 * works around them. Where the branch is the reader's own there is nobody to
 * message, and the commands print on their own.
 *
 * `--force` is deliberately absent: replacing fi with one branch discards the
 * other branches' integration instead of resolving anything.
 */
export function renderConflicts(
  conflicts: BranchConflict[],
  defBranch: string,
  inFi: Set<string>,
  opts: Options
): string {
  const s = makeStyle(opts);
  const authors = branchAuthors(defBranch);
  const me = userEmail().toLowerCase();
  const project = detectGitlabProject()?.project;
  const where = project ? `${project}@fi` : "fi";
  const quote = quotePathEnabled();
  const lines: string[] = [];
  let messages = 0;

  const author = (name: string): Author | undefined => authors.get(`origin/${name}`);

  // Each branch carries its latest commit's author, so the line says who fixes it
  // rather than leaving the reader to work out whose branch it is. The default
  // branch is nobody's to rebase, so it is named bare.
  const owned = (name: string): string => {
    const a = author(name);
    return a ? `${name} (${a.email})` : name;
  };

  // The rebase stops at the conflict for someone to resolve, so the push is its
  // own step after it rather than the end of one chain that reads as automatic.
  const rebase = (branch: string): string[] => [
    `1. git checkout ${shq(branch)} && git pull && git rebase origin/${shq(defBranch)}`,
    "2. resolve the conflict, then git rebase --continue",
    "3. git push --force-with-lease",
  ];

  const chunkLines = (c: BranchConflict, indent: string): string[] => {
    if (!c.chunk) return [];
    const out = c.chunk.lines.map((l) => `${indent}${l}`);
    if (c.chunk.more > 0) out.push(`${indent}${s.dim(`… +${c.chunk.more} more lines`)}`);
    return out;
  };

  for (const c of byMostCleared(conflicts, defBranch)) {
    const against = c.with
      .map((w) => (w === defBranch ? w : owned(w)))
      .join(", ");
    lines.push(
      ` ${s.dim("*")} ${s.cyan(owned(c.branch))}  ${s.redBold(`conflicts with ${against}`)}`
    );
    lines.push(...pathItems(c.paths, opts));

    // Keeping a branch mergeable is its author's job, fi or no fi, and fi merges
    // in insertion order, so the branch that failed is the later arrival and
    // its author is the one to adjust. Where that author is the reader, the
    // peer's author gets a heads-up instead: there is nobody else to ask, and
    // the overlap is still theirs to know about.
    const owner = author(c.branch);
    const ownerIsMe = !!owner && owner.email.toLowerCase() === me;
    const peerAuthors: Author[] = [];
    if (c.kind === "peer") {
      for (const name of c.with) {
        const a = author(name);
        if (!a || a.email.toLowerCase() === me) continue;
        if (!peerAuthors.some((r) => r.email === a.email)) peerAuthors.push(a);
      }
    }
    const headsUp = c.kind === "peer" && ownerIsMe;
    const recipients: Author[] = headsUp
      ? peerAuthors
      : owner && !ownerIsMe
        ? [owner]
        : [];

    const firstName = (a: Author): string => a.name.split(/\s+/)[0] || a.email;
    const peers = c.with.join(" and ");
    const peersNamed = c.with
      .map((w) => {
        const a = author(w);
        return a?.name ? `${w} (${a.name})` : w;
      })
      .join(" and ");
    const peerFirstNames = peerAuthors.map(firstName).join(" and ");
    const path = quoteCStyle(c.chunk?.path ?? c.paths[0] ?? "", quote);
    const peerFix = `change ${c.branch} so it no longer conflicts with ${peers}`;

    // The hunk sits between the sentence that introduces it and what to do about it.
    let intro: string;
    let after: string[];
    if (c.kind === "default") {
      intro = c.chunk
        ? `${c.branch} couldn't merge into ${where}; main changed the same lines in ${path}:`
        : `${c.branch} couldn't merge into ${where}; it conflicts with main in ${path}.`;
      after = ["To fix:", ...rebase(c.branch)];
    } else if (headsUp) {
      intro = `heads-up: my ${c.branch} overlaps your ${peers} in ${path} on ${where}${c.chunk ? ":" : "."}`;
      after = [
        `I'll adjust mine. Anything in flight on that file I should know about?`,
      ];
    } else if (c.kind === "peer") {
      const verb = c.with.length === 1 ? "changes" : "change";
      intro = c.chunk
        ? `${c.branch} couldn't merge into ${where}: ${peersNamed} already ${verb} ${path}, and ${c.branch}'s change to the same lines conflicts with it:`
        : `${c.branch} couldn't merge into ${where}: it conflicts with ${peersNamed} in ${path}.`;
      after = [
        peerFirstNames
          ? `To fix: talk to ${peerFirstNames} about how the two changes should fit together.`
          : `To fix: ${peerFix}.`,
      ];
    } else {
      intro = `${c.branch} couldn't merge into ${where}. It merges cleanly with each branch on its own, but not with ${peers} together.`;
      after = [];
    }

    if (recipients.length > 0) {
      messages++;
      const names = recipients.map(firstName).join(", ");
      const to = recipients.map((r) => (r.name ? `${r.name} <${r.email}>` : r.email)).join(", ");
      lines.push(`     ${s.bold(`Message ${to}:`)}`);
      lines.push(`       hey ${names}, ${intro}`);
      lines.push(...chunkLines(c, "         "));
      lines.push(...after.map((l) => `       ${l}`));
    } else {
      lines.push(...chunkLines(c, "     "));
      if (c.kind === "default") lines.push(...rebase(c.branch).map((l) => `     ${s.bold(l)}`));
      if (c.kind === "peer") lines.push(`     ${s.bold(`To fix: ${peerFix}`)}`);
    }
    lines.push("");
  }

  // Taking the failing branches out gets fi building for everyone else now;
  // the messages above are what get those branches back in.
  //
  // A branch that failed on the way *in* was never added, so there is nothing
  // to remove and the line is only offered for the ones fi actually holds.
  const removable = conflicts
    .map((c) => c.branch)
    .filter((name) => inFi.has(name));
  if (removable.length > 0) {
    lines.push(s.dim("─".repeat(RULE_WIDTH)));
    lines.push("To get fi building again now, take the failing branches out:");
    lines.push(`  ${s.greenBold(`git fi -r ${removable.map(shq).join(" ")}`)}`);
    if (messages > 0) lines.push(s.dim("Then send the messages above, so they can be fixed and added back."));
  }

  return lines.join("\n").replace(/\n+$/, "") + "\n";
}
