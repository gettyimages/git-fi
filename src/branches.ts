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
