#!/usr/bin/env node
import { createRequire } from "node:module";
import type { Options } from "./types.js";
import { abort } from "./style.js";
import { preflightChecks, ensureFetched, setDebug } from "./git.js";
import { cmdList, cmdAdd, cmdRemove, cmdForce, cmdAgain, cmdAbort, cmdSelect } from "./commands.js";
import { notifyUpdate, updateSelf } from "./update-check.js";
import { renderHelp } from "./help.js";
import { installCompletions } from "./install-completions.js";
import { cmdAuth } from "./auth.js";
import { detectGitlabProject } from "./gitlab.js";

const require = createRequire(import.meta.url);
const { name, version } = require("../package.json");

function parseArgs(argv: string[]) {
  const opts: Options = {
    debug: false,
    bare: false,
    json: false,
    select: false,
    yes: false,
  };
  let action: string | null = null;
  let filterPattern: string | undefined;
  let authAction: string | undefined;
  let hostFlag: string | undefined;
  const branches: string[] = [];

  // `install-completions` owns its own arguments (a target, `--write <dir>`),
  // and it is always the first word — git intercepts flags, not subcommands, so
  // it reaches us untouched. Hand them over before the flag loop below, which
  // knows nothing of `--write` and would abort on it as an unknown option.
  if (argv[0] === "install-completions") {
    return {
      opts,
      action: "install-completions",
      branches: argv.slice(1),
      filterPattern,
      authAction,
      hostFlag,
    };
  }

  // Indexed rather than for-of because `--host` consumes the argument after it.
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    // `--auth` carries its verb as a value rather than as a subcommand: a lone
    // positional to `git fi` is a list filter, so an `auth` subcommand would
    // reserve that word (AUTH-05).
    if (arg === "--auth" || arg.startsWith("--auth=")) {
      if (action) abort(`Cannot combine --${action} with --auth`, opts);
      action = "auth";
      authAction = arg === "--auth" ? "status" : arg.slice("--auth=".length);
      continue;
    }

    if (arg === "--host" || arg.startsWith("--host=")) {
      const value = arg === "--host" ? argv[++i] : arg.slice("--host=".length);
      // A following flag is a missing value, not a hostname — without this,
      // `git fi --host --auth` swallows the action and silently lists instead.
      if (!value || value.startsWith("-")) abort("--host requires a hostname", opts);
      hostFlag = value;
      continue;
    }

    switch (arg) {
      case "--debug":
      case "-d":
        opts.debug = true;
        break;
      case "--bare":
      case "-b":
        opts.bare = true;
        break;
      case "--json":
      case "-j":
        opts.json = true;
        break;
      case "--select":
      case "-s":
        opts.select = true;
        break;
      case "--yes":
      case "-y":
        opts.yes = true;
        break;
      case "--version":
      case "-V":
        process.stdout.write(`git-fi ${version}\n`);
        process.exit(0);
      case "--help":
      case "-h":
        process.stdout.write(renderHelp());
        process.exit(0);
      case "--add":
      case "-a":
        if (action) abort(`Cannot combine --${action} with ${arg}`, opts);
        action = "add";
        break;
      case "--remove":
      case "-r":
        if (action) abort(`Cannot combine --${action} with ${arg}`, opts);
        action = "remove";
        break;
      case "--force":
      case "-f":
        if (action) abort(`Cannot combine --${action} with ${arg}`, opts);
        action = "force";
        break;
      case "--again":
      case "-g":
        if (action) abort(`Cannot combine --${action} with ${arg}`, opts);
        action = "again";
        break;
      case "--abort":
      case "-A":
        if (action) abort(`Cannot combine --${action} with ${arg}`, opts);
        action = "abort";
        break;
      // Listed under Options rather than Actions (it acts on the install, not
      // on fi), but it dispatches as one, so it collides with them the same way.
      case "--update":
      case "-u":
        if (action) abort(`Cannot combine --${action} with ${arg}`, opts);
        action = "update";
        break;
      default:
        // `git fi help` — git only intercepts the `--help`/`-h` flags (routing
        // them to `man git-fi`), so this bare word reaches us and gives a
        // man-independent path to the same help text.
        if (arg === "help" && !action && branches.length === 0) {
          process.stdout.write(renderHelp());
          process.exit(0);
        }
        if (arg.startsWith("-")) {
          abort(`Unknown option: ${arg}`, opts);
        }
        branches.push(arg);
        break;
    }
  }

  // The same subcommand behind a leading git-fi flag (`git fi -d
  // install-completions`), which the early hand-off above doesn't see. Its own
  // flags are not available in this form.
  if (!action && branches[0] === "install-completions") {
    return {
      opts,
      action: "install-completions",
      branches: branches.slice(1),
      filterPattern,
      authAction,
      hostFlag,
    };
  }

  // Without this, `git fi --update my-branch` — a plausible slip for `--add` —
  // silently reinstalls git-fi and never touches the branch.
  if (action === "update" && branches.length > 0) {
    abort("--update does not accept branch names", opts);
  }

  if (action === "auth" && branches.length > 0) {
    abort("--auth does not accept branch names", opts);
  }

  if (hostFlag !== undefined && action !== "auth") {
    abort("--host is only valid with --auth", opts);
  }

  if (!action && branches.length === 0 && !opts.select) action = "list";
  if (!action && branches.length > 0) {
    if (branches.length > 1) {
      abort("list filter accepts exactly one pattern", opts);
    }
    action = "list";
    filterPattern = branches[0];
  }

  if (opts.select && !action) {
    action = "select";
  }

  if (opts.select && action !== "add" && action !== "remove" && action !== "select") {
    abort("--select is only valid with --add or --remove", opts);
  }

  // `--bare` / `--json` choose an output format and work with any action
  // (OPTION-08), but the picker draws its interactive UI on stdout, which is where
  // machine output goes — the two cannot share the stream. Checked before the
  // TTY test below: the flag combination is wrong whatever the environment, and
  // reporting a missing terminal would point at the wrong thing.
  if (opts.select && (opts.json || opts.bare)) {
    abort(
      `--select cannot be combined with ${opts.json ? "--json" : "--bare"}`,
      opts
    );
  }

  if (opts.select && (!process.stdin.isTTY || !process.stdout.isTTY)) {
    abort("--select requires an interactive terminal", opts);
  }

  return { opts, action: action!, branches, filterPattern, authAction, hostFlag };
}

async function main() {
  const argv = process.argv.slice(2);
  const { opts, action, branches, filterPattern, authAction, hostFlag } = parseArgs(argv);
  setDebug(opts.debug);

  // Runs anywhere (no repo needed) and must not touch stdout beyond the script,
  // so handle it before the update notice and pre-flight checks.
  if (action === "install-completions") {
    installCompletions(branches, opts);
    return;
  }

  // Same reasoning: updating is not a repo operation, so it must work from any
  // directory — and an "update available" notice on the way out of an update is
  // noise.
  if (action === "update") {
    updateSelf(name);
  }

  // Also not a repo operation: `--host` supplies the host directly, so a login
  // must work from any directory (AUTH-07) — which pre-flight would refuse.
  if (action === "auth") {
    await cmdAuth(authAction!, hostFlag ?? detectGitlabProject()?.host ?? null, opts);
    return;
  }

  // Before preflight: an update notice should surface even when the command
  // aborts (wrong directory, no fi branch, etc.), not only on a clean run.
  notifyUpdate(name, version, opts);
  preflightChecks(opts);

  if (action !== "list") {
    await ensureFetched(opts);
  }

  switch (action) {
    case "list":
      await ensureFetched(opts, true);
      await cmdList(opts, filterPattern);
      break;
    case "add":
      await cmdAdd(branches, opts);
      break;
    case "remove":
      await cmdRemove(branches, opts);
      break;
    case "force":
      await cmdForce(branches, opts);
      break;
    case "again":
      await cmdAgain(branches, opts);
      break;
    case "abort":
      await cmdAbort(branches, opts);
      break;
    case "select":
      await cmdSelect(opts);
      break;
    default:
      abort(`Unknown action: ${action}`, opts);
  }
}

main().catch((err: Error) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
