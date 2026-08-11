import type { Options } from "./types.js";
import { makeStyle } from "./style.js";
import { git, gitOutcome, branchAuthors, localBranchName } from "./git.js";

/** A branch that could not be merged, and what stopped it (READY-03). */
export interface BranchConflict {
  /** The branch, without the `origin/` prefix, as the report and the JSON carry it. */
  branch: string;
  /** What it conflicts with: the default branch, or peer branches, unprefixed. */
  with: string[];
  /** Paths merge-tree reported as conflicted. */
  paths: string[];
}

/** What attribution (READY-03) made of a branch list. */
export interface Attribution {
  conflicts: BranchConflict[];
  /**
   * False when a probe could not run at all. An empty `conflicts` then means
   * "nothing was measured" rather than "nothing conflicts", and the two call
   * for different things to be said.
   */
  attributable: boolean;
}

type MergeTreeResult =
  | { outcome: "clean"; tree: string }
  | { outcome: "conflict"; tree: string; paths: string[] }
  | { outcome: "error" };

// 40 hex for SHA-1, 64 for a SHA-256 repository.
const OID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

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
  if (status === 0) return { outcome: "clean", tree };

  const paths: string[] = [];
  for (const field of fields.slice(1)) {
    if (field === "") break;
    paths.push(field);
  }
  return { outcome: "conflict", tree, paths };
}

// The identity is pinned rather than read from config because attribution runs
// on the failure path, where a repo with no user.email configured would turn a
// merge conflict into an unrelated commit-tree error. Nothing references these
// commits, so gc reclaims them.
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
  args.push("-m", "git-fi conflict probe");
  return git(args) ?? "";
}

/**
 * Merge `branches` incrementally against the default branch without touching a
 * ref, the index, or the working tree, and report what each failing branch
 * conflicts with (READY-03, READY-06).
 *
 * A failing branch is left out of the accumulated set, so one bad branch does
 * not condemn every branch listed after it.
 */
export function attributeConflicts(
  branches: string[],
  defBranch: string
): Attribution {
  const base = `origin/${defBranch}`;
  const conflicts: BranchConflict[] = [];
  let accumulated = base;
  const merged: string[] = [];

  for (const branch of branches) {
    const result = mergeTree(accumulated, branch);
    // A probe that could not run says nothing about this branch, and every
    // branch after it would be measured against a set this one should have
    // joined. Reporting the first failure as "conflicts with main" and then
    // repeating it down the list is the "everything is broken" verdict
    // attribution exists to replace, so stop and say nothing instead.
    if (result.outcome === "error") return { conflicts: [], attributable: false };
    if (result.outcome === "clean") {
      accumulated = commitTree(result.tree, [accumulated, branch]);
      merged.push(branch);
      continue;
    }

    // Against the default branch alone the accumulated set is out of the
    // picture, which is what separates "this branch needs a rebase" from "these
    // two branches overlap".
    const vsDefault = accumulated === base ? result : mergeTree(base, branch);
    if (vsDefault.outcome === "error") {
      return { conflicts: [], attributable: false };
    }
    if (vsDefault.outcome === "conflict") {
      conflicts.push({
        branch: localBranchName(branch),
        with: [defBranch],
        paths: vsDefault.paths,
      });
      continue;
    }

    const peers = merged.filter(
      (peer) => mergeTree(peer, branch).outcome === "conflict"
    );
    conflicts.push({
      branch: localBranchName(branch),
      // A peer sweep can come up empty when the conflict only appears in the
      // combination — say the branch to add against the merge of two others.
      // Naming the set is the honest answer there.
      with: (peers.length > 0 ? peers : merged).map(localBranchName),
      paths: result.paths,
    });
  }

  return { conflicts, attributable: true };
}

/**
 * Quote a branch name for the command lines the report prints, which a person
 * is invited to paste into a shell. A ref name may contain backticks, `;`,
 * `&&`, `|`, `>`, quotes and a leading `-` — `git branch` and `git update-ref`
 * both take them — so a branch named ``feat`id`x`` would otherwise render as a
 * bold instruction to run it. Single quotes are the only form that stops
 * command substitution: inside double quotes a backtick still expands. `'\''`
 * closes, escapes, and reopens for a literal quote.
 *
 * Left bare when the name has nothing a shell reads, which is nearly always,
 * so the common case still reads as something you would have typed.
 */
function shq(name: string): string {
  if (/^[A-Za-z0-9._/][A-Za-z0-9._/-]*$/.test(name)) return name;
  return `'${name.replace(/'/g, "'\\''")}'`;
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
  const items = shown.map((p) => `     ${s.dim("*")} ${p}`);
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
