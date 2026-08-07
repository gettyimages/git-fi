import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import type { Options } from "./types.js";
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

export function gitExitCode(args: string[], gitOpts: GitOpts = {}): number {
  try {
    git(args, gitOpts);
    return 0;
  } catch (err: unknown) {
    return (err as { status?: number }).status ?? 1;
  }
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
    if (ver < 21300) {
      abort(
        `git version ${match[1]} is too old, please upgrade to at least 2.13.0.`,
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
// separator: it cannot appear in a ref name (git rejects control characters).
const FIELD_SEP = "\x1f";

interface RemoteBranch {
  name: string;
  /** Commit date as YYYY-MM-DD. */
  date: string;
}

// One `git branch -r` invocation carries the name, symref, and commit date for
// every remote branch, so callers never spawn a `git log` per candidate.
function listRemoteBranches(
  defBranch: string,
  extraArgs: string[] = []
): RemoteBranch[] {
  const lines = gitLines([
    "branch",
    "-r",
    ...extraArgs,
    `--format=%(refname:short)${FIELD_SEP}%(symref)${FIELD_SEP}%(committerdate:short)`,
  ]);

  const branches: RemoteBranch[] = [];
  for (const line of lines) {
    const [name, symref, date] = line.split(FIELD_SEP);
    // origin/HEAD renders as a bare `origin` under refname:short, so it slips
    // past a name comparison. Match the symref field, which only HEAD sets.
    if (symref) continue;
    if (name === "origin/fi" || name === `origin/${defBranch}`) continue;
    branches.push({ name, date });
  }
  return branches;
}

export function allRemoteBranches(defBranch: string): string[] {
  return listRemoteBranches(defBranch).map((b) => b.name);
}

export function remoteBranchesNoMergedSince(
  defBranch: string,
  sinceMonths: number = 3
): string[] {
  const since = new Date();
  since.setMonth(since.getMonth() - sinceMonths);
  const sinceStr = since.toISOString().slice(0, 10);

  return listRemoteBranches(defBranch, [
    "--no-merged",
    `origin/${defBranch}`,
    "--sort=-committerdate",
  ])
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
 */
export function mergedRemoteBranches(defBranch: string): Set<string> {
  return new Set(
    gitLines([
      "branch",
      "-r",
      "--merged",
      `origin/${defBranch}`,
      "--format=%(refname:short)",
    ])
  );
}

export function isInteractive(_opts: Options): boolean {
  return (
    process.stdin.isTTY === true &&
    process.stdout.isTTY === true
  );
}
