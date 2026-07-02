import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import type { Options } from "./types.js";
import { abort, makeStyle, bulletList, createSpinner } from "./style.js";
import { DOCS_URL } from "./help.js";

let fetchDone = false;

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
    debug = false,
    showErrors = false,
    allowFailure = false,
  }: GitOpts = {}
): string | null {
  const stderrDest = debug || showErrors ? "pipe" : "ignore";
  if (debug) {
    process.stderr.write(`+ git ${args.join(" ")}\n`);
  }
  try {
    const out = execFileSync("git", args, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", stderrDest],
      maxBuffer: 50 * 1024 * 1024,
    });
    return out.trimEnd();
  } catch (err) {
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
    if (ver < 25000) {
      abort(
        `git version ${match[1]} is too old, please upgrade to at least 2.50.0.`,
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
// prune/abort) never pass it, so they always fetch — an integration merge must
// never silently build on stale refs, whatever the environment holds.
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
    const fetchArgs = ["fetch", "--prune", "origin"];
    if (!opts.debug) fetchArgs.splice(1, 0, "--quiet");
    git(fetchArgs, { debug: opts.debug });
  } finally {
    spin.stop();
  }
}

export function defaultBranch(): string {
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
// DEFAULT_WRITE_FORMAT / BL-04 in src/merge.ts).
export function detectCommitFormat(commitMsg: string): CommitFormat {
  if (/Merge remote-tracking branch(es)? '/.test(commitMsg)) return "legacy";
  return "terse";
}

export function parseBranchList(commitMsg: string, defBranch: string): string[] {
  // The CI commit message (MG-13) is `<preamble>\n\n<signature>`, where the
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
    const missing: string[] = [];
    for (const b of resolved) {
      if (git(["rev-parse", "--verify", b], { allowFailure: true }) === null) {
        missing.push(b);
      }
    }
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

export function allRemoteBranches(defBranch: string): string[] {
  const lines = gitLines([
    "branch",
    "-r",
    "--format=%(refname:short)",
  ]);
  return lines.filter(
    (b) =>
      !b.includes("->") &&
      b !== "origin/HEAD" &&
      b !== "origin/fi" &&
      b !== `origin/${defBranch}`
  );
}

export function remoteBranchesNoMergedSince(
  defBranch: string,
  sinceMonths: number = 3
): string[] {
  const since = new Date();
  since.setMonth(since.getMonth() - sinceMonths);
  const sinceStr = since.toISOString().slice(0, 10);

  const lines = gitLines([
    "branch",
    "-r",
    "--no-merged", `origin/${defBranch}`,
    "--sort=-committerdate",
    "--format=%(refname:short)",
  ]);

  const candidates = lines.filter(
    (b) =>
      !b.includes("->") &&
      b !== "origin/HEAD" &&
      b !== "origin/fi" &&
      b !== `origin/${defBranch}`
  );

  return candidates.filter((b) => {
    const date = git(["log", "-1", "--format=%ci", b], { allowFailure: true });
    if (!date) return false;
    return date.slice(0, 10) >= sinceStr;
  });
}

export function isInteractive(_opts: Options): boolean {
  return (
    process.stdin.isTTY === true &&
    process.stdout.isTTY === true
  );
}
