import type { Options, CIResult } from "./types.js";
import { makeStyle, printTable, abort } from "./style.js";
import {
  git,
  gitExitCode,
  defaultBranch,
  currentFiBranches,
  resolveBranches,
  allRemoteBranches,
  remoteBranchesNoMergedSince,
  ensureFetched,
  isInteractive,
} from "./git.js";
import { fetchGitlabCI, printCITable, detectGitlabProject, fetchFiPipeline, STATUS_EMOJI } from "./gitlab.js";
import { mergeProcess } from "./merge.js";
import { pickBranches } from "./ui.js";

async function fetchPickerCI(
  branches: string[],
  opts: Options
): Promise<Map<string, CIResult> | undefined> {
  if (!process.env.GITLAB_ACCESS_TOKEN) return undefined;
  const results = await fetchGitlabCI(branches, opts);
  const map = new Map<string, CIResult>();
  for (const r of results) map.set(r.branch, r);
  return map;
}

export async function cmdList(
  opts: Options,
  filterPattern?: string,
  pushedSha?: string | null
): Promise<void> {
  const s = makeStyle(opts);

  const fiExists = git(["rev-parse", "--verify", "origin/fi"], {
    allowFailure: true,
  });
  if (fiExists === null) {
    abort(`there is no ${s.fi()} branch for this project.`, opts);
  }

  const defBranch = defaultBranch();
  let branches = currentFiBranches(defBranch);

  if (filterPattern !== undefined) {
    const re = new RegExp(filterPattern);
    branches = branches.filter((b) =>
      re.test(b.replace(/^origin\//, ""))
    );
    if (branches.length === 0) {
      process.stderr.write(`no branches in fi match '${filterPattern}'\n`);
      process.exit(1);
    }
  }

  const shortNames = branches.map((b) => b.replace(/^origin\//, ""));

  if (opts.bare) {
    process.stdout.write(shortNames.join(" ") + "\n");
    return;
  }

  if (opts.json) {
    const obj: Record<string, unknown> = {
      command: "list",
      branches: shortNames,
    };
    if (process.env.GITLAB_ACCESS_TOKEN) {
      const ci = await fetchGitlabCI(branches, opts);
      obj.ci = ci.map((r) => ({
        branch: r.branch.replace(/^origin\//, ""),
        status: r.status,
        author: r.author,
        date: r.date,
        branchMissing: r.branchMissing,
      }));
    }
    process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
    return;
  }

  const gitlab = detectGitlabProject();

  if (process.env.GITLAB_ACCESS_TOKEN) {
    const ci = await fetchGitlabCI(branches, opts);
    printCITable(ci, opts, gitlab);

    if (gitlab) {
      const pipeline = fetchFiPipeline(opts, gitlab, pushedSha ?? undefined);
      if (pipeline) {
        const emoji = STATUS_EMOJI[pipeline.status] || "";
        const idText = s.link(s.dim(`#${pipeline.id}`), pipeline.url);
        process.stdout.write(`fi: ${idText} ${emoji}\n`);
      }
    }
  } else {
    const rows = shortNames.map((name) => {
      const label = gitlab
        ? s.link(s.cyan(name), `https://${gitlab.host}/${gitlab.project}/-/tree/${encodeURIComponent(name)}`)
        : s.cyan(name);
      return [label];
    });
    printTable(["Branch"], rows, opts);
  }

  process.stdout.write("\n");

  if (
    !process.env.GITLAB_ACCESS_TOKEN &&
    !process.env.GIT_FI_NO_HINTS &&
    !opts.bare &&
    !opts.json
  ) {
    process.stdout.write(
      "For enhanced CI status, export GITLAB_ACCESS_TOKEN. To suppress this hint, export GIT_FI_NO_HINTS.\n"
    );
  }
}

export async function cmdAdd(
  branches: string[],
  opts: Options
): Promise<void> {
  const s = makeStyle(opts);
  const defBranch = defaultBranch();
  let resolved: string[];

  if (opts.select && isInteractive(opts)) {
    const existing = currentFiBranches(defBranch);
    const existingSet = new Set(existing);
    const available = allRemoteBranches(defBranch).filter(
      (b) => !existingSet.has(b)
    );
    const ciData = await fetchPickerCI(available, opts);
    const picked = await pickBranches(
      available,
      `Select branches to add to ${s.fi()}:`,
      [],
      ciData
    );
    if (picked === null) {
      process.stderr.write("Cancelled.\n");
      process.exit(0);
    }
    if (picked.length === 0) {
      process.stderr.write("No branches selected.\n");
      process.exit(0);
    }
    resolved = picked;
  } else {
    resolved = resolveBranches(branches, "add", opts);
  }

  const existing = currentFiBranches(defBranch);
  const combined = [...new Set([...existing, ...resolved])];

  const sha = await mergeProcess("add", resolved, combined, opts);
  await cmdList(opts, undefined, sha);
}

export async function cmdRemove(
  branches: string[],
  opts: Options
): Promise<void> {
  const s = makeStyle(opts);
  const defBranch = defaultBranch();
  let resolved: string[];

  if (opts.select && isInteractive(opts)) {
    const existing = currentFiBranches(defBranch);
    const ciData = await fetchPickerCI(existing, opts);
    const picked = await pickBranches(
      existing,
      `Select branches to remove from ${s.fi()}:`,
      [],
      ciData
    );
    if (picked === null) {
      process.stderr.write("Cancelled.\n");
      process.exit(0);
    }
    if (picked.length === 0) {
      process.stderr.write("No branches selected.\n");
      process.exit(0);
    }
    resolved = picked;
  } else {
    resolved = resolveBranches(branches, "remove", opts);
  }

  const existing = currentFiBranches(defBranch);
  const removeSet = new Set(resolved);
  const combined = existing.filter((b) => !removeSet.has(b));

  const sha = await mergeProcess("remove", resolved, combined, opts);
  await cmdList(opts, undefined, sha);
}

export async function cmdForce(
  branches: string[],
  opts: Options
): Promise<void> {
  const resolved =
    branches.length > 0 ? resolveBranches(branches, "force", opts) : [];

  const sha = await mergeProcess("force", resolved, resolved, opts);
  await cmdList(opts, undefined, sha);
}

export async function cmdAgain(
  branches: string[],
  opts: Options
): Promise<void> {
  if (branches.length > 0) {
    abort("--again does not accept branch names", opts);
  }

  const defBranch = defaultBranch();
  const existing = currentFiBranches(defBranch);

  const sha = await mergeProcess("again", [], existing, opts);
  await cmdList(opts, undefined, sha);
}

export async function cmdPrune(
  branches: string[],
  opts: Options
): Promise<void> {
  if (branches.length > 0) {
    abort("--prune does not accept branch names", opts);
  }

  const defBranch = defaultBranch();
  const existing = currentFiBranches(defBranch);

  const dead = existing.filter(
    (b) => git(["rev-parse", "--verify", b], { allowFailure: true }) === null
  );
  const merged = existing.filter(
    (b) =>
      dead.indexOf(b) === -1 &&
      gitExitCode(["merge-base", "--is-ancestor", b, `origin/${defBranch}`]) === 0
  );

  if (dead.length === 0 && merged.length === 0) {
    process.stdout.write("Nothing to prune.\n");
    return;
  }

  const sha = await mergeProcess("prune", [], existing, opts);
  await cmdList(opts, undefined, sha);
}

export async function cmdAbort(
  branches: string[],
  opts: Options
): Promise<void> {
  const s = makeStyle(opts);
  if (branches.length > 0) {
    abort("--abort does not accept branch names", opts);
  }

  await ensureFetched(opts);

  if (gitExitCode(["rev-parse", "--verify", "origin/fi"]) !== 0) {
    abort("origin/fi does not exist — nothing to re-pull", opts);
  }

  git(["fetch", "--quiet", "origin", "fi"], { debug: opts.debug });
  git(["update-ref", "refs/remotes/origin/fi", "FETCH_HEAD"], { debug: opts.debug });

  process.stderr.write(`${s.bold("Re-pulled")} ${s.fi()} from origin.\n`);
}

export async function cmdSelect(opts: Options): Promise<void> {
  const s = makeStyle(opts);
  const defBranch = defaultBranch();
  const existing = currentFiBranches(defBranch);
  const existingSet = new Set(existing);

  const unmerged = remoteBranchesNoMergedSince(defBranch, 3);

  const allBranches = [
    ...existing,
    ...unmerged.filter((b) => !existingSet.has(b)),
  ];

  if (allBranches.length === 0) {
    process.stderr.write("No candidate branches found.\n");
    process.exit(0);
  }

  const ciData = await fetchPickerCI(allBranches, opts);
  const selected = await pickBranches(
    allBranches,
    `Toggle branches for ${s.fi()} (current fi branches are pre-selected):`,
    existing,
    ciData
  );

  if (selected === null) {
    process.stderr.write("Cancelled.\n");
    process.exit(0);
  }

  const selectedSet = new Set(selected);
  const toAdd = selected.filter((b) => !existingSet.has(b));
  const toRemove = existing.filter((b) => !selectedSet.has(b));

  if (toAdd.length === 0 && toRemove.length === 0) {
    process.stderr.write("No changes.\n");
    process.exit(0);
  }

  const combined = existing
    .filter((b) => selectedSet.has(b))
    .concat(toAdd);

  const action = toRemove.length > 0 && toAdd.length === 0 ? "remove" : "add";
  const sha = await mergeProcess(action, toAdd.length > 0 ? toAdd : toRemove, combined, opts);
  await cmdList(opts, undefined, sha);
}
