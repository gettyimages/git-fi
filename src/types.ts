export interface Options {
  debug: boolean;
  bare: boolean;
  json: boolean;
  select: boolean;
  yes: boolean;
}

export interface CIResult {
  branch: string;
  status: string;
  pipelineId: string;
  author: string;
  date: string;
  branchMissing: boolean;
}

/**
 * Where a branch stands against the default branch (READY-01, READY-07).
 * `null` counts mean git could not answer: no `origin/<default>` to compare
 * against, a shallow clone whose window truncates the walk, or a field that
 * did not parse.
 */
export interface BranchReadiness {
  /** Commits the branch would add to the default branch. */
  ahead: number | null;
  behind: number | null;
  /** Nothing ahead — every commit has landed, so the branch is spent. */
  merged: boolean;
}
