import type { Options, CIResult } from "./types.js";
import { makeStyle, colorEnabled, createSpinner, printTable, abort } from "./style.js";
import { git } from "./git.js";
import { resolveToken, tokenFormUrl, REQUIRED_SCOPE, type TokenResolution } from "./auth.js";

export const STATUS_EMOJI: Record<string, string> = {
  success: "\u2705",
  failed: "\u274C",
  timeout: "\u23F0",
  running: "\u23F3",
  pending: "\u23F3",
  missing: "\u2796",
  skipped: "\u23ED\uFE0F",
};

export const STATUS_WORD: Record<string, string> = {
  success: "success",
  failed: "failed",
  timeout: "timed out",
  running: "running",
  pending: "pending",
  missing: "none",
  skipped: "skipped",
};

/**
 * Render a pipeline status for the Pipeline column and the `fi:` line (TERM-10).
 * The emoji is the only thing carrying the status in either place, so a reader
 * of plain text (a CI job log, a piped run) gets the word instead. Gated on
 * `colorEnabled`, which is already the decoration/plain-text split.
 */
export function statusLabel(status: string, opts: Options): string {
  const table = colorEnabled(opts) ? STATUS_EMOJI : STATUS_WORD;
  return table[status] || "";
}

const API_TIMEOUT_MS = 10000;

// Requests in flight at once against the GitLab API. The picker can offer
// dozens of branches, and an unbounded fan-out would trip GitLab's rate
// limiter; 8 saturates a round trip without getting throttled.
const API_CONCURRENCY = 8;

interface GitlabProject {
  host: string;
  project: string;
}

let projectCache: GitlabProject | null | undefined;

export function detectGitlabProject(): GitlabProject | null {
  if (projectCache !== undefined) return projectCache;
  projectCache = parseOriginUrl(
    git(["remote", "get-url", "origin"], { allowFailure: true })
  );
  return projectCache;
}

function parseOriginUrl(url: string | null): GitlabProject | null {
  if (!url) return null;

  let m = url.match(/@([^:]+):(.+?)(?:\.git)?$/);
  if (m) return { host: m[1], project: m[2] };

  m = url.match(/https?:\/\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (m) return { host: m[1], project: m[2] };

  return null;
}

/**
 * The token for this repository's GitLab host, or null when there is none
 * (AUTH-01). Every consumer goes through here rather than reading the
 * environment itself, so the list table, the JSON `ci` array, the picker, and
 * the post-merge `fi:` line cannot end up disagreeing about which token —
 * or whether one exists at all.
 */
export function gitlabToken(opts: Options): TokenResolution | null {
  return resolveToken(detectGitlabProject()?.host ?? null, opts);
}

/** How to go back to basic mode, named for wherever the live token came from. */
function basicModeHint(resolved: TokenResolution): string {
  return resolved.source === "config"
    ? "To use git-fi without CI status, run 'git fi --auth=logout'."
    : "To use git-fi without CI status, unset GITLAB_ACCESS_TOKEN and try again.";
}

/**
 * What a rejected token should say (AUTH-13). A 401 is about the credential,
 * not the branch the request happened to name, and the reader's next move is to
 * replace it — so lead with the source that supplied it and link the form that
 * issues a new one, rather than printing GitLab's JSON and offering only to
 * turn CI status off.
 *
 * Carries no SGR styling of its own: `abort` wraps the whole message in red,
 * and an inner reset would end that colour for every line after it. The OSC 8
 * link is safe, being no colour at all.
 */
export function rejectedTokenMessage(
  resolved: TokenResolution,
  s: ReturnType<typeof makeStyle>
): string {
  const host = resolved.host;
  const from = resolved.source === "config" ? "the stored token" : "GITLAB_ACCESS_TOKEN";
  const replace =
    "Run git fi --auth=login to store the new one" +
    (resolved.source === "config"
      ? "."
      : ", which takes\nprecedence over GITLAB_ACCESS_TOKEN (AUTH-01), or update the export.");

  const url = host ? tokenFormUrl(host) : null;
  const form = url
    ? `\nCreate a replacement, prefilled for git-fi with ${REQUIRED_SCOPE} only:\n` +
      `  ${s.link(url, url)}\n\n`
    : "\n";

  return (
    `${host ?? "GitLab"} rejected ${from} (HTTP 401).\n` +
    form +
    `${replace}\n\n${basicModeHint(resolved)}`
  );
}

interface ApiResponse {
  status: number;
  body: string;
}

async function apiGet(url: string, token: string): Promise<ApiResponse> {
  const res = await fetch(url, {
    headers: { "PRIVATE-TOKEN": token },
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  return { status: res.status, body: await res.text() };
}

/** Run `fn` over `items` with at most `limit` concurrent calls, preserving order. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < items.length; i = next++) {
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return results;
}

// A per-branch fetch either produced a row or hit a hard HTTP error. Failures
// are carried rather than thrown so the abort can be raised for the first
// branch in list order. With requests in flight concurrently, whichever
// response lands first is otherwise arbitrary.
type BranchOutcome =
  | { ok: true; result: CIResult }
  | { ok: false; ref: string; status: number; body: string };

export async function fetchGitlabCI(
  branches: string[],
  opts: Options
): Promise<CIResult[]> {
  const resolved = gitlabToken(opts);
  if (!resolved) {
    abort("No GitLab token available; run 'git fi --auth=login'", opts);
  }
  const token = resolved.token;

  const proj = detectGitlabProject();
  if (!proj) {
    abort("Could not detect GitLab project from origin URL", opts);
  }

  const spin = createSpinner("Fetching CI status...", opts);
  const encodedProject = encodeURIComponent(proj.project);

  const fetchBranch = async (branch: string): Promise<BranchOutcome> => {
    const ref = branch.replace(/^origin\//, "");
    const encodedRef = encodeURIComponent(ref);
    const pipelines = await apiGet(
      `https://${proj.host}/api/v4/projects/${encodedProject}/pipelines?ref=${encodedRef}&per_page=1`,
      token
    );

    if (pipelines.status === 404) {
      return {
        ok: true,
        result: { branch, status: "missing", pipelineId: "", author: "", date: "", branchMissing: true },
      };
    }
    if (pipelines.status < 200 || pipelines.status >= 300) {
      return { ok: false, ref, status: pipelines.status, body: pipelines.body };
    }

    const parsed = JSON.parse(pipelines.body);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return {
        ok: true,
        result: { branch, status: "missing", pipelineId: "", author: "", date: "", branchMissing: false },
      };
    }

    const p = parsed[0];
    const commit = await apiGet(
      `https://${proj.host}/api/v4/projects/${encodedProject}/repository/commits/${encodedRef}`,
      token
    );

    let author = "";
    let date = "";
    let branchMissing = false;
    if (commit.status >= 200 && commit.status < 300) {
      const body = JSON.parse(commit.body);
      author = body.author_name || "";
      date = body.committed_date ? body.committed_date.slice(0, 10) : "";
    } else if (commit.status === 404) {
      branchMissing = true;
    }

    return {
      ok: true,
      result: {
        branch,
        status: p.status || "missing",
        pipelineId: String(p.id || ""),
        author,
        date,
        branchMissing,
      },
    };
  };

  let outcomes: BranchOutcome[];
  try {
    outcomes = await mapLimit(branches, API_CONCURRENCY, fetchBranch);
  } catch (err) {
    spin.stop();
    const msg = err instanceof Error ? err.message : String(err);
    abort(
      `GitLab API request failed: ${msg}\n\n${basicModeHint(resolved)}`,
      opts
    );
  } finally {
    spin.stop();
  }

  for (const outcome of outcomes) {
    if (!outcome.ok) {
      abort(
        outcome.status === 401
          ? rejectedTokenMessage(resolved, makeStyle(opts))
          : `GitLab API returned HTTP ${outcome.status} for branch '${outcome.ref}': ${outcome.body}\n\n${basicModeHint(resolved)}`,
        opts
      );
    }
  }

  return outcomes.map((o) => (o as { ok: true; result: CIResult }).result);
}

export interface FiPipelineInfo {
  url: string;
  id: string;
  status: string;
}

// GitLab registers the pipeline for a push asynchronously, so the first lookup
// after `git push` often finds nothing. Back off rather than sleeping a flat
// 1.5 s: the common case (already registered) returns after the short first
// wait instead of paying the worst-case delay every time.
const PIPELINE_RETRY_DELAYS_MS = [500, 1000, 2000];

export async function fetchFiPipeline(
  opts: Options,
  gitlab: GitlabProject,
  pushedSha?: string
): Promise<FiPipelineInfo | null> {
  const resolved = gitlabToken(opts);
  if (!resolved) return null;
  const token = resolved.token;

  const encodedProject = encodeURIComponent(gitlab.project);
  let apiUrl = `https://${gitlab.host}/api/v4/projects/${encodedProject}/pipelines?ref=fi&per_page=1`;
  if (pushedSha) {
    apiUrl += `&sha=${pushedSha}`;
  }

  const delays = pushedSha ? PIPELINE_RETRY_DELAYS_MS : [];

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, delays[attempt - 1]));
    }

    try {
      const res = await apiGet(apiUrl, token);
      if (res.status >= 200 && res.status < 300) {
        const pipelines = JSON.parse(res.body);
        if (Array.isArray(pipelines) && pipelines.length > 0) {
          const p = pipelines[0];
          return {
            url: `https://${gitlab.host}/${gitlab.project}/-/pipelines/${p.id}`,
            id: String(p.id),
            status: p.status || "unknown",
          };
        }
      } else if (opts.debug) {
        process.stderr.write(`Pipeline lookup returned HTTP ${res.status}\n`);
      }
    } catch (err) {
      if (opts.debug) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Pipeline lookup failed: ${msg}\n`);
      }
    }
  }

  return null;
}

/**
 * Where a branch in fi should link to: what it adds on top of the default
 * branch. Someone reading fi is asking what is in the integration branch, and a
 * compare view answers that directly — `/-/tree` lands on a file listing they
 * would then have to diff themselves.
 */
export function branchCompareUrl(
  gitlab: GitlabProject,
  branch: string,
  defaultBranch: string
): string {
  // Each side is encoded separately: encoding the whole `a...b` would escape the
  // dots GitLab uses to separate them.
  const base = `https://${gitlab.host}/${gitlab.project}/-/compare`;
  return `${base}/${encodeURIComponent(defaultBranch)}...${encodeURIComponent(branch)}`;
}

export function printCITable(
  ciResults: CIResult[],
  opts: Options,
  gitlab: GitlabProject | null | undefined,
  defaultBranch: string
): void {
  const s = makeStyle(opts);
  const headers = ["Branch", "Date", "Author", "Pipeline"];
  const rows = ciResults.map((item) => {
    const branchName = item.branch.replace(/^origin\//, "");
    const nameText = item.branchMissing
      ? s.yellow(`${branchName} (deleted)`)
      : gitlab
        ? s.linkOrMarkdown(s.cyan(branchName), branchCompareUrl(gitlab, branchName, defaultBranch))
        : s.cyan(branchName);
    const branchLabel = nameText;
    const status = item.status in STATUS_EMOJI ? item.status : "missing";
    const label = statusLabel(status, opts);
    const pipeline = item.pipelineId
      ? `${gitlab ? s.link(item.pipelineId, `https://${gitlab.host}/${gitlab.project}/-/pipelines/${item.pipelineId}`) : item.pipelineId} ${label}`
      : label;
    return [branchLabel, item.date, item.author, pipeline];
  });
  printTable(headers, rows, opts);
}
