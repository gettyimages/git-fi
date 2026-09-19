// Branch names move between two spellings: the `origin/`-prefixed remote-tracking
// ref git-fi keys everything on, and the bare name a user types and reads. These
// convert between them and touch nothing else — no git, no terminal — so the
// presentation and serialization layers can normalize a name without importing
// the module that spawns subprocesses.

export function resolveBranchName(name: string): string {
  if (!name.startsWith("origin/")) return `origin/${name}`;
  return name;
}

/** The counterpart of `resolveBranchName`: the name as a user says it. */
export function localBranchName(name: string): string {
  return name.replace(/^origin\//, "");
}

/**
 * The spelling to hand git. Its revision lookup tries `refs/tags/<name>` and
 * `refs/heads/<name>` before `refs/remotes/<name>`, so a local branch named
 * `origin/feature` wins the short `origin/feature` and the merge would take
 * work that was never pushed — the one thing MERGE-02 promises cannot happen.
 * git warns that the name is ambiguous, on a stderr git-fi discards off
 * `--debug`, so the short form fails silently.
 */
export function remoteRef(name: string): string {
  return `refs/remotes/${resolveBranchName(name)}`;
}

/** The same disambiguation for the caller's own branch, against a same-named tag. */
export function localRef(name: string): string {
  return `refs/heads/${localBranchName(name)}`;
}
