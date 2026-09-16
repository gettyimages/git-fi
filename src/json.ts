import type { CIResult, BranchReadiness } from "./types.js";
import { localBranchName } from "./branches.js";

/**
 * Serialize and write a `--json` document, waiting for the bytes to reach the
 * OS (JSON-03). stdout is asynchronous on a pipe, so an exit on the same tick
 * drops whatever is still buffered — a document wider than the 64K pipe buffer
 * arrives truncated mid-string to the `| jq` the flag exists for, while the
 * same run redirected to a file is whole. Every `--json` document goes through
 * here so the flush is not something each new writer has to remember.
 */
export function writeJson(doc: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    process.stdout.write(JSON.stringify(doc, null, 2) + "\n", (err) =>
      err ? reject(err) : resolve()
    );
  });
}

/**
 * One branch as it appears in `--json` (JSON-01): everything known about it
 * nested under the branch rather than spread across arrays keyed by name.
 * `ci` is null wherever no pipeline data was fetched — no token resolved
 * (`AUTH-01`), or the caller is on a path that does not reach the API.
 *
 * `ahead` and `behind` are null where git could not answer, and where the
 * branch is gone from origin and so has no listing entry at all. Zero is a
 * real position — level with the default branch — so an unknown one cannot
 * borrow it without inventing a state the branch is not in.
 */
export function branchJson(
  branch: string,
  readiness: Map<string, BranchReadiness>,
  ci?: Map<string, CIResult>
): Record<string, unknown> {
  const r = readiness.get(branch);
  const c = ci?.get(branch);
  return {
    name: localBranchName(branch),
    ahead: r?.ahead ?? null,
    behind: r?.behind ?? null,
    merged: r?.merged ?? false,
    ci: c
      ? {
          status: c.status,
          pipelineId: c.pipelineId,
          author: c.author,
          date: c.date,
          branchMissing: c.branchMissing,
        }
      : null,
  };
}
