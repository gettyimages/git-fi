import type { Options, CIResult } from "./types.js";
import { makeStyle, printTable, abort, hintsEnabled, withReadiness, strikeIfMerged } from "./style.js";
import {
  git,
  gitExitCode,
  defaultBranch,
  currentFiBranches,
  resolveBranches,
  allRemoteBranches,
  branchReadiness,
  localBranchName,
  remoteBranchesNoMergedSince,
  ensureFetched,
  isInteractive,
} from "./git.js";
import { fetchGitlabCI, printCITable, detectGitlabProject, fetchFiPipeline, statusLabel, branchCompareUrl, gitlabToken } from "./gitlab.js";
import { mergeProcess } from "./merge.js";
import { branchJson } from "./json.js";
import { pickBranches } from "./ui.js";
import { DOCS_URL } from "./help.js";

async function fetchPickerCI(
  branches: string[],
  opts: Options
): Promise<Map<string, CIResult> | undefined> {
  if (!gitlabToken(opts)) return undefined;
  const results = await fetchGitlabCI(branches, opts);
  const map = new Map<string, CIResult>();
  for (const r of results) map.set(r.branch, r);
  return map;
}

/**
 * Print the resulting branch list. Every mutation ends here, so this is also
 * what renders `--bare` / `--json` for a non-list action (OPTION-08); `command`
 * names the action that ran so the JSON does not claim to be a `list`.
 */
export async function cmdList(
  opts: Options,
  filterPattern?: string,
  pushedSha?: string | null,
  command = "list"
): Promise<void> {
  const s = makeStyle(opts);

  const fiExists = git(["rev-parse", "--verify", "origin/fi"], {
    allowFailure: true,
  });
  if (fiExists === null) {
    process.stderr.write(
      `${s.redBold(`there is no ${s.fi()} branch for this project.`)}\n`
    );
    process.stderr.write(
      `${s.dim("Bootstrap one with")} ${s.bold("git fi --add <branch>")}` +
        ` ${s.dim(`(add --yes for CI). Docs: ${DOCS_URL}`)}\n`
    );
    process.exit(1);
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
    const readiness = branchReadiness(defBranch);
    const ciByBranch = new Map<string, CIResult>();
    if (gitlabToken(opts)) {
      for (const r of await fetchGitlabCI(branches, opts)) {
        ciByBranch.set(r.branch, r);
      }
    }
    process.stdout.write(
      JSON.stringify(
        { command, branches: branches.map((b) => branchJson(b, readiness, ciByBranch)) },
        null,
        2
      ) + "\n"
    );
    return;
  }

  const gitlab = detectGitlabProject();

  // A zero-row table prints nothing at all (LIST-07), which reads as a command
  // that failed to produce output rather than as an fi with nothing in it.
  if (branches.length === 0) {
    process.stdout.write(`${s.italic("(no branches)")}\n`);
  }

  if (gitlabToken(opts)) {
    const ci = await fetchGitlabCI(branches, opts);
    printCITable(ci, opts, gitlab, defBranch);

    if (gitlab) {
      const pipeline = await fetchFiPipeline(opts, gitlab, pushedSha ?? undefined);
      if (pipeline) {
        const label = statusLabel(pipeline.status, opts);
        const idText = s.link(s.dim(`#${pipeline.id}`), pipeline.url);
        process.stdout.write(`fi: ${idText} ${label}\n`);
      }
    }
  } else {
    const readiness = branchReadiness(defBranch);
    const rows = branches.map((branch) => {
      const name = localBranchName(branch);
      const r = readiness.get(branch);
      const text = strikeIfMerged(name, r, opts);
      const label = gitlab
        ? s.linkOrMarkdown(s.cyan(text), branchCompareUrl(gitlab, name, defBranch))
        : s.cyan(text);
      return [withReadiness(label, r, opts)];
    });
    printTable(["Branch"], rows, opts);
  }

  process.stdout.write("\n");

  if (branches.length === 0 && hintsEnabled(opts)) {
    process.stdout.write("Add a branch with git fi --add <branch>.\n");
  }

  // Names the login rather than the export (LIST-04): the hint only ever
  // reaches a person at a terminal, and that path asks for a read_api token.
  if (!gitlabToken(opts) && hintsEnabled(opts)) {
    process.stdout.write(
      "For enhanced CI status, run git fi --auth=login. To suppress this hint, export GIT_FI_NO_HINTS.\n"
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
  await cmdList(opts, undefined, sha, "add");
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
  await cmdList(opts, undefined, sha, "remove");
}

export async function cmdForce(
  branches: string[],
  opts: Options
): Promise<void> {
  const resolved =
    branches.length > 0 ? resolveBranches(branches, "force", opts) : [];

  const sha = await mergeProcess("force", resolved, resolved, opts);
  await cmdList(opts, undefined, sha, "force");
}

/**
 * Re-merge everything currently in fi onto the current default branch. The
 * merge process drops dead and already-merged branches on the way through
 * (MERGE-06, MERGE-07), so this is also what prunes fi. There is no separate prune
 * action.
 */
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
  await cmdList(opts, undefined, sha, "again");
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

  git(["fetch", "--quiet", "--no-tags", "origin", "fi"], { debug: opts.debug });
  git(["update-ref", "refs/remotes/origin/fi", "FETCH_HEAD"], { debug: opts.debug });

  process.stderr.write(`${s.bold("Re-pulled")} ${s.fi()} from origin.\n`);

  // The status line above is stderr, so every action — this one included — ends
  // by rendering the resulting branch list on stdout (OPTION-08). Without it,
  // `--abort --json` would exit 0 having written no JSON at all.
  await cmdList(opts, undefined, null, "abort");
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
  await cmdList(opts, undefined, sha, action);
}
