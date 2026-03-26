import { execFileSync } from "node:child_process";
import type { Options, CIResult } from "./types.js";
import { makeStyle, createSpinner, printTable, abort } from "./style.js";
import { git } from "./git.js";

export const STATUS_EMOJI: Record<string, string> = {
  success: "\u2705",
  failed: "\u274C",
  timeout: "\u23F0",
  running: "\u23F3",
  pending: "\u23F3",
  missing: "\u2796",
  skipped: "\u23ED\uFE0F",
};

export function detectGitlabProject(): { host: string; project: string } | null {
  const url = git(["remote", "get-url", "origin"], { allowFailure: true });
  if (!url) return null;

  let m = url.match(/@([^:]+):(.+?)(?:\.git)?$/);
  if (m) return { host: m[1], project: m[2] };

  m = url.match(/https?:\/\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (m) return { host: m[1], project: m[2] };

  return null;
}

export async function fetchGitlabCI(
  branches: string[],
  opts: Options
): Promise<CIResult[]> {
  const token = process.env.GITLAB_ACCESS_TOKEN;
  if (!token) {
    abort("GITLAB_ACCESS_TOKEN is set but empty", opts);
  }

  const proj = detectGitlabProject();
  if (!proj) {
    abort("Could not detect GitLab project from origin URL", opts);
  }

  const spin = createSpinner("Fetching CI status...", opts);
  const results: CIResult[] = [];
  const encodedProject = encodeURIComponent(proj.project);
  try {
    for (const branch of branches) {
      const ref = branch.replace(/^origin\//, "");
      const encodedRef = encodeURIComponent(ref);
      const apiUrl = `https://${proj.host}/api/v4/projects/${encodedProject}/pipelines?ref=${encodedRef}&per_page=1`;

      const response = execFileSync(
        "curl",
        ["-s", "-w", "\n%{http_code}", "-H", `PRIVATE-TOKEN: ${token}`, apiUrl],
        { encoding: "utf-8", timeout: 10000 }
      );

      const lastNewline = response.lastIndexOf("\n");
      const httpCode = parseInt(response.slice(lastNewline + 1), 10);
      const body = response.slice(0, lastNewline);

      if (httpCode === 404) {
        results.push({ branch, status: "missing", pipelineId: "", author: "", date: "", branchMissing: true });
        continue;
      }
      if (httpCode < 200 || httpCode >= 300) {
        abort(
          `GitLab API returned HTTP ${httpCode} for branch '${ref}': ${body}\n\nTo use git-fi without CI status, unset GITLAB_ACCESS_TOKEN and try again.`,
          opts
        );
      }

      const pipelines = JSON.parse(body);
      if (Array.isArray(pipelines) && pipelines.length > 0) {
        const p = pipelines[0];
        const commitUrl = `https://${proj.host}/api/v4/projects/${encodedProject}/repository/commits/${encodedRef}`;
        let author = "";
        let date = "";

        const commitResp = execFileSync(
          "curl",
          ["-s", "-w", "\n%{http_code}", "-H", `PRIVATE-TOKEN: ${token}`, commitUrl],
          { encoding: "utf-8", timeout: 10000 }
        );
        const commitLastNl = commitResp.lastIndexOf("\n");
        const commitHttpCode = parseInt(commitResp.slice(commitLastNl + 1), 10);
        const commitBody = commitResp.slice(0, commitLastNl);

        let branchMissing = false;
        if (commitHttpCode >= 200 && commitHttpCode < 300) {
          const commit = JSON.parse(commitBody);
          author = commit.author_name || "";
          date = commit.committed_date
            ? commit.committed_date.slice(0, 10)
            : "";
        } else if (commitHttpCode === 404) {
          branchMissing = true;
        }

        results.push({
          branch,
          status: p.status || "missing",
          pipelineId: String(p.id || ""),
          author,
          date,
          branchMissing,
        });
      } else {
        results.push({ branch, status: "missing", pipelineId: "", author: "", date: "", branchMissing: false });
      }
    }
    return results;
  } catch (err) {
    spin.stop();
    const msg = err instanceof Error ? err.message : String(err);
    abort(
      `GitLab API request failed: ${msg}\n\nTo use git-fi without CI status, unset GITLAB_ACCESS_TOKEN and try again.`,
      opts
    );
  } finally {
    spin.stop();
  }
}

export interface FiPipelineInfo {
  url: string;
  id: string;
  status: string;
}

export function fetchFiPipeline(
  opts: Options,
  gitlab: { host: string; project: string },
  pushedSha?: string
): FiPipelineInfo | null {
  const token = process.env.GITLAB_ACCESS_TOKEN;
  if (!token) return null;

  const encodedProject = encodeURIComponent(gitlab.project);
  const maxAttempts = pushedSha ? 4 : 1;
  const delayMs = 1500;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
    }

    try {
      let apiUrl = `https://${gitlab.host}/api/v4/projects/${encodedProject}/pipelines?ref=fi&per_page=1`;
      if (pushedSha) {
        apiUrl += `&sha=${pushedSha}`;
      }

      const response = execFileSync(
        "curl",
        ["-s", "-f", "-H", `PRIVATE-TOKEN: ${token}`, apiUrl],
        { encoding: "utf-8", timeout: 10000 }
      );
      const pipelines = JSON.parse(response);
      if (Array.isArray(pipelines) && pipelines.length > 0) {
        const p = pipelines[0];
        return {
          url: `https://${gitlab.host}/${gitlab.project}/-/pipelines/${p.id}`,
          id: String(p.id),
          status: p.status || "unknown",
        };
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

export function printCITable(
  ciResults: CIResult[],
  opts: Options,
  gitlab?: { host: string; project: string } | null
): void {
  const s = makeStyle(opts);
  const headers = ["Branch", "Date", "Author", "Pipeline"];
  const rows = ciResults.map((item) => {
    const branchName = item.branch.replace(/^origin\//, "");
    const nameText = item.branchMissing
      ? s.yellow(`${branchName} (deleted)`)
      : gitlab
        ? s.link(
            s.cyan(branchName),
            `https://${gitlab.host}/${gitlab.project}/-/tree/${encodeURIComponent(branchName)}`
          )
        : s.cyan(branchName);
    const branchLabel = nameText;
    const emoji = STATUS_EMOJI[item.status] || STATUS_EMOJI.missing;
    const pipeline = item.pipelineId
      ? `${gitlab ? s.link(item.pipelineId, `https://${gitlab.host}/${gitlab.project}/-/pipelines/${item.pipelineId}`) : item.pipelineId} ${emoji}`
      : emoji;
    return [branchLabel, item.date, item.author, pipeline];
  });
  printTable(headers, rows, opts);
}
