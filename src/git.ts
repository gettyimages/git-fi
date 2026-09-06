import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import type { Options, BranchReadiness } from "./types.js";
import { abort, makeStyle, bulletList, createSpinner } from "./style.js";
import { DOCS_URL } from "./help.js";

let fetchDone = false;

// `--debug` is a property of the run, not of a call site. Threading it through
// every `git()` argument list meant the 20 call sites that didn't forward it —
// among them every read query on the list path — stayed silent, so a `--debug`
// run traced the fetch and nothing else. PLATFORM-01 describes the flag as
// global; this is what makes that true.
let debugEnabled = false;

export function setDebug(on: boolean): void {
  debugEnabled = on;
}

interface GitOpts {
  quiet?: boolean;
  debug?: boolean;
  showErrors?: boolean;
  allowFailure?: boolean;
}

export function git(
  args: string[],
  {
    quiet = true,
    debug: debugOpt = false,
    showErrors = false,
    allowFailure = false,
  }: GitOpts = {}
): string | null {
  const debug = debugOpt || debugEnabled;
  const stderrDest = debug || showErrors ? "pipe" : "ignore";
  // The command is announced before it runs and timed after, so a hang shows
  // you which git call is hanging rather than only being attributable once it
  // returns. The elapsed line is what makes `--debug` usable for "why is this
  // repo slow" — a fetch and a for-each-ref look identical without it.
  const started = debug ? Date.now() : 0;
  if (debug) {
    process.stderr.write(`+ git ${args.join(" ")}\n`);
  }
  const report = () => {
    if (debug) {
      process.stderr.write(`  ${((Date.now() - started) / 1000).toFixed(2)}s\n`);
    }
  };
  try {
    const out = execFileSync("git", args, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", stderrDest],
      maxBuffer: 50 * 1024 * 1024,
    });
    report();
    return out.trimEnd();
  } catch (err) {
    report();
    if (allowFailure) return null;
    throw err;
  }
}

export function gitLines(args: string[], gitOpts?: GitOpts): string[] {
  const out = git(args, gitOpts);
  if (out === null || out === "") return [];
  return out.split("\n");
}

/**
 * Run git for a command whose nonzero exit is an answer rather than a failure —
 * `merge-tree` reports a conflict with exit 1 and still writes the tree and the
 * conflicted paths to stdout, which `allowFailure` would discard.
 */
export function gitOutcome(
  args: string[],
  gitOpts: GitOpts = {}
): { status: number; out: string } {
  try {
    return { status: 0, out: git(args, gitOpts) ?? "" };
  } catch (err) {
    const e = err as { status?: number; stdout?: string | Buffer };
    return {
      status: e.status ?? 1,
      out: (e.stdout?.toString() ?? "").trimEnd(),
    };
  }
}

export function gitExitCode(args: string[], gitOpts: GitOpts = {}): number {
  return gitOutcome(args, gitOpts).status;
}

export function preflightChecks(opts: Options): void {
  if (!existsSync(".git")) {
    const s = makeStyle(opts);
    const url = `${DOCS_URL}#/`;
    process.stderr.write(`${s.redBold("No .git directory found.")}\n`);
    process.stderr.write(
      `${s.dim("git fi runs inside a git repository — see")} ${s.link(url, url)}\n`
    );
    process.exit(1);
  }

  const verStr = git(["--version"]) ?? "";
  const match = verStr.match(/(\d+\.\d+\.\d+)/);
  if (match) {
    const parts = match[1].split(".").map(Number);
    const ver = parts[0] * 10000 + parts[1] * 100 + parts[2];
    if (ver < 24100) {
      abort(
        `git version ${match[1]} is too old, please upgrade to at least 2.41.0.`,
        opts
      );
    }
  }

  const pushDefault = git(["config", "push.default"], { allowFailure: true });
  if (pushDefault === "upstream" || pushDefault === "tracking") {
    abort(
      "Your default git push config is set to a hazardous option.",
      opts
    );
  }
}

// `allowSkip` is passed only on the read-only list path. GIT_FI_NO_FETCH may
// then operate on already-fetched remote-tracking refs (shell completion sets
// it so tab-completion stays offline). Mutating paths (add/remove/force/again/
// abort) never pass it, so they always fetch: an integration merge must never
// silently build on stale refs, whatever the environment holds.
export async function ensureFetched(
  opts: Options,
  allowSkip = false
): Promise<void> {
  if (fetchDone) return;
  if (allowSkip && process.env.GIT_FI_NO_FETCH) {
    fetchDone = true;
    return;
  }
  fetchDone = true;
  const spin = createSpinner("Fetching from origin...", opts);
  try {
    // --no-tags: git-fi reads branches and never a tag, so the tag refspec buys
    // nothing it uses. What that saves varies by server — one project measured
    // 12-15s with tags against 1-2s without, transferring no tags either way,
    // while a comparable project on the same host saw no difference (PRE-04).
    const fetchArgs = ["fetch", "--prune", "--no-tags", "origin"];
    if (!opts.debug) fetchArgs.splice(1, 0, "--quiet");
    git(fetchArgs, { debug: opts.debug });
  } finally {
    spin.stop();
  }
}

let defaultBranchCache: string | undefined;

export function defaultBranch(): string {
  if (defaultBranchCache !== undefined) return defaultBranchCache;
  defaultBranchCache = resolveDefaultBranch();
  return defaultBranchCache;
}

function resolveDefaultBranch(): string {
  const ref = git(["symbolic-ref", "refs/remotes/origin/HEAD"], {
    allowFailure: true,
  });
  if (ref !== null) return basename(ref);
  for (const candidate of ["main", "master"]) {
    if (
      git(["rev-parse", "--verify", `origin/${candidate}`], {
        allowFailure: true,
      }) !== null
    ) {
      return candidate;
    }
  }
  return "main";
}

export type CommitFormat = "terse" | "legacy";

// Read-side only: classify an existing fi commit message so parseBranchList
// can extract the branch list from either format. This does not choose what
// git-fi writes — that is pinned to legacy during the rollout (see
// DEFAULT_WRITE_FORMAT / STORAGE-04 in src/merge.ts).
export function detectCommitFormat(commitMsg: string): CommitFormat {
  if (/Merge remote-tracking branch(es)? '/.test(commitMsg)) return "legacy";
  return "terse";
}

export function parseBranchList(commitMsg: string, defBranch: string): string[] {
  // The CI commit message (MERGE-13) is `<preamble>\n\n<signature>`, where the
  // preamble embeds the previous fi message ("Was originally: ---") — which can
  // itself quote branch names or carry an old signature line. git-fi always
  // appends the signature it just wrote as the final paragraph, so parse only
  // that paragraph; otherwise branches removed in this operation resurface from
  // the embedded history and accumulate across CI re-merges.
  const sep = commitMsg.lastIndexOf("\n\n");
  const sig = sep === -1 ? commitMsg : commitMsg.slice(sep + 2);

  if (detectCommitFormat(sig) === "legacy") {
    const branches: string[] = [];
    const re = /'origin\/([^']+)'/g;
    let m;
    while ((m = re.exec(sig)) !== null) {
      const name = `origin/${m[1]}`;
      if (name !== `origin/${defBranch}` && name !== "origin/fi") branches.push(name);
    }
    return [...new Set(branches)];
  }

  const match = sig.match(/^\(([^)]+)\)@\[/m);
  if (match) {
    return [
      ...new Set(
        match[1]
          .split(",")
          .map((b) => `origin/${b.trim()}`)
          .filter((b) => b !== `origin/${defBranch}`)
      ),
    ];
  }
  if (/^@\[[0-9a-f]+\]/m.test(sig)) {
    return [];
  }
  return [];
}

export function currentFiBranches(defBranch: string): string[] {
  const msg = git(["log", "-1", "--format=%B", "origin/fi"], {
    allowFailure: true,
  });
  if (msg === null) return [];
  return parseBranchList(msg, defBranch);
}

export function resolveBranchName(name: string): string {
  if (!name.startsWith("origin/")) return `origin/${name}`;
  return name;
}

/** The counterpart of `resolveBranchName`: the name as a user says it. */
export function localBranchName(name: string): string {
  return name.replace(/^origin\//, "");
}

export function currentBranchName(): string | null {
  return git(["symbolic-ref", "--short", "HEAD"], { allowFailure: true });
}

export function resolveBranches(
  names: string[],
  action: string,
  opts: Options
): string[] {
  let resolved = names.map(resolveBranchName);

  if (resolved.length === 0 && (action === "add" || action === "remove")) {
    const cur = currentBranchName();
    if (!cur || ["main", "master", "fi", "HEAD"].includes(cur)) {
      abort("No branch was specified.", opts);
    }
    resolved = [resolveBranchName(cur)];
  }

  if (action === "add" || action === "force") {
    const existing = existingRemoteRefs();
    const missing = resolved.filter((b) => !existing.has(b));
    if (missing.length > 0) {
      const s = makeStyle(opts);
      process.stderr.write(
        `${s.redBold("the following branches do not exist on origin:")}\n`
      );
      process.stderr.write(bulletList(missing, opts));
      process.exit(1);
    }
  }

  return resolved;
}

// `git branch --format` has no field separator of its own, so use a unit
// separator. A ref name cannot contain one (git rejects control characters),
// but `%(authoremail:trim)` is free text a commit author chooses, so the
// separator alone does not fix the field count — see FIELD_COUNT below.
const FIELD_SEP = "\x1f";

// Every field the format asks for. A line that splits into anything else came
// from a field carrying the separator, and there is no way to tell which value
// landed where, so the line is dropped rather than guessed at.
const FIELD_COUNT = 5;

interface RemoteBranch {
  name: string;
  /** Commit date as YYYY-MM-DD. */
  date: string;
  /** Commits this branch carries that the default branch does not (READY-07). */
  ahead: number | null;
  /** Commits of the default branch this branch does not yet contain (READY-01). */
  behind: number | null;
  /** Author of the branch tip — who last moved it, so who owns a rebase of it. */
  authorEmail: string;
}

/**
 * Author emails are free text chosen by whoever wrote the commit, and git
 * accepts ANSI escapes in them: `git fsck --strict` passes them, and
 * `%(authoremail:trim)` emits the bytes verbatim. Printed raw beside the
 * remedy in a conflict report, `\e[2K` or `\e[A` would let a branch tip
 * repaint text git-fi had already written. Strip the controls at the boundary
 * where the value enters, so no caller has to remember to.
 */
function sanitize(field: string): string {
  return field.replace(/[\x00-\x1f\x7f-\x9f]/g, "");
}

function count(field: string | undefined): number | null {
  const n = Number(field);
  return field !== undefined && field !== "" && Number.isInteger(n) ? n : null;
}

// One `git branch -r` invocation carries the name, symref, commit date, ahead
// and behind counts, and tip author for every remote branch, so callers never
// spawn a `git log` or a `git rev-list --count` per candidate (PERF-01).
//
// `%(ahead-behind:)` costs git a revision walk per ref, so it is asked for only
// where a caller reads the counts. `readiness: false` is the candidate listing,
// which wants a name and a date.
function listRemoteBranches(
  defBranch: string,
  { extraArgs = [], readiness = true }: { extraArgs?: string[]; readiness?: boolean } = {}
): RemoteBranch[] {
  // The atom is fatal when its argument does not resolve — `fatal: failed to
  // find 'origin/x'`, exit 128 — and `defaultBranch()` falls back to a name
  // rather than a ref that exists. Asking for it only once the ref is there
  // keeps a repo with no `origin/HEAD` listing its branches.
  const comparable =
    readiness &&
    git(["rev-parse", "--verify", "--quiet", `origin/${defBranch}`], {
      allowFailure: true,
    }) !== null;
  const aheadBehindAtom = comparable
    ? `%(ahead-behind:origin/${defBranch})`
    : "";

  const lines = gitLines([
    "branch",
    "-r",
    ...extraArgs,
    `--format=%(refname:short)${FIELD_SEP}%(symref)${FIELD_SEP}%(committerdate:short)${FIELD_SEP}${aheadBehindAtom}${FIELD_SEP}%(authoremail:trim)`,
  ]);

  // In a shallow clone the walk stops at the graft, so a count describes the
  // fetched window rather than the branch: one measured 1 ahead and 6 behind
  // reports 2 and 2. `behind` is reported as a number to a reader (READY-02),
  // where a wrong one is worse than none, so it is dropped.
  //
  // `ahead` is kept, because the only thing derived from it is `merged`
  // (READY-07) and truncation moves that the safe way: a window that hides a
  // branch's commits makes it look *more* ahead, so a landed branch can go
  // unnoticed but a live one is never declared merged and pruned. Dropping it
  // would instead stop MERGE-07 pruning anything in CI, where shallow clones
  // are the default.
  const truncated =
    git(["rev-parse", "--is-shallow-repository"], { allowFailure: true }) ===
    "true";

  const branches: RemoteBranch[] = [];
  for (const line of lines) {
    const fields = line.split(FIELD_SEP);
    if (fields.length !== FIELD_COUNT) continue;
    const [name, symref, date, aheadBehind, authorEmail] = fields;
    // origin/HEAD renders as a bare `origin` under refname:short, so it slips
    // past a name comparison. Match the symref field, which only HEAD sets.
    if (symref) continue;
    if (!name.startsWith("origin/")) continue;
    if (name === "origin/fi" || name === `origin/${defBranch}`) continue;
    const [ahead, behind] = aheadBehind.split(" ");
    branches.push({
      name,
      date,
      ahead: count(ahead),
      behind: truncated ? null : count(behind),
      authorEmail: sanitize(authorEmail),
    });
  }
  return branches;
}

// PERF-02: the unfiltered listing answers several questions (candidate
// branches, behind counts) on paths that each ask independently. The readiness
// map is derived once alongside it, so the four callers that want it share one.
interface RemoteBranchCache {
  defBranch: string;
  branches: RemoteBranch[];
  readiness: Map<string, BranchReadiness>;
}
let remoteBranchCache: RemoteBranchCache | null = null;

function cachedListing(defBranch: string): RemoteBranchCache {
  if (remoteBranchCache?.defBranch !== defBranch) {
    const branches = listRemoteBranches(defBranch);
    const readiness = new Map<string, BranchReadiness>();
    for (const b of branches) {
      readiness.set(b.name, {
        ahead: b.ahead,
        behind: b.behind,
        merged: b.ahead === 0,
      });
    }
    remoteBranchCache = { defBranch, branches, readiness };
  }
  return remoteBranchCache;
}

function cachedRemoteBranches(defBranch: string): RemoteBranch[] {
  return cachedListing(defBranch).branches;
}

export function allRemoteBranches(defBranch: string): string[] {
  return cachedRemoteBranches(defBranch).map((b) => b.name);
}

/**
 * Tip author per remote branch, keyed by the `origin/`-prefixed name — who last
 * moved the branch, and so who owns rebasing it out of a conflict (READY-04).
 * It is the tip commit's author rather than a branch owner git does not record,
 * so a bot-pushed tip reports the bot.
 */
export function branchAuthors(defBranch: string): Map<string, string> {
  const authors = new Map<string, string>();
  for (const b of cachedRemoteBranches(defBranch)) {
    if (b.authorEmail) authors.set(b.name, b.authorEmail);
  }
  return authors;
}

/**
 * Where each remote branch stands against the default branch (READY-01,
 * READY-07), keyed by the `origin/`-prefixed name.
 *
 * An unknown ahead count reads as *not* merged. `merged` is what MERGE-07
 * prunes on, and pruning rewrites fi's branch list and force-pushes it, so a
 * missing signal has to fail towards keeping someone's branch.
 */
export function branchReadiness(defBranch: string): Map<string, BranchReadiness> {
  return cachedListing(defBranch).readiness;
}

export function remoteBranchesNoMergedSince(
  defBranch: string,
  sinceMonths: number = 3
): string[] {
  const since = new Date();
  since.setMonth(since.getMonth() - sinceMonths);
  const sinceStr = since.toISOString().slice(0, 10);

  return listRemoteBranches(defBranch, {
    extraArgs: ["--no-merged", `origin/${defBranch}`, "--sort=-committerdate"],
    readiness: false,
  })
    .filter((b) => b.date >= sinceStr)
    .map((b) => b.name);
}

/** Every remote-tracking ref that exists, as `origin/<name>`. */
export function existingRemoteRefs(): Set<string> {
  return new Set(
    gitLines(["for-each-ref", "--format=%(refname:short)", "refs/remotes"])
  );
}

/**
 * Remote branches already reachable from `origin/<defBranch>`: the batched
 * equivalent of `git merge-base --is-ancestor <branch> origin/<defBranch>`.
 *
 * A branch with nothing ahead of the default branch has had every commit
 * landed, which is what `git branch -r --merged` reports — so this reads the
 * cached listing (PERF-02) rather than spending a second invocation on the
 * same question.
 */
export function mergedRemoteBranches(defBranch: string): Set<string> {
  const merged = new Set<string>();
  for (const [name, r] of branchReadiness(defBranch)) {
    if (r.merged) merged.add(name);
  }
  return merged;
}

export function isInteractive(_opts: Options): boolean {
  return (
    process.stdin.isTTY === true &&
    process.stdout.isTTY === true
  );
}
