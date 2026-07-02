#!/usr/bin/env node
import { createRequire } from "node:module";
import type { Options } from "./types.js";
import { abort } from "./style.js";
import { preflightChecks, ensureFetched } from "./git.js";
import { cmdList, cmdAdd, cmdRemove, cmdForce, cmdAgain, cmdPrune, cmdAbort, cmdSelect } from "./commands.js";
import { notifyUpdate } from "./update-check.js";
import { renderHelp } from "./help.js";
import { installCompletions } from "./install-completions.js";

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
  const branches: string[] = [];

  for (const arg of argv) {
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
      case "--prune":
      case "-p":
        if (action) abort(`Cannot combine --${action} with ${arg}`, opts);
        action = "prune";
        break;
      case "--abort":
      case "-A":
        if (action) abort(`Cannot combine --${action} with ${arg}`, opts);
        action = "abort";
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

  // `git fi install-completions [bash|zsh]` — a subcommand word (git only
  // intercepts flags), so it reaches us. The optional shell follows as the
  // second positional.
  if (!action && branches[0] === "install-completions") {
    return {
      opts,
      action: "install-completions",
      branches: branches.slice(1),
      filterPattern,
    };
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

  if (opts.select && (!process.stdin.isTTY || !process.stdout.isTTY)) {
    abort("--select requires an interactive terminal", opts);
  }

  if (opts.json && action !== "list") {
    abort("--json is only valid with the list command", opts);
  }

  if (opts.bare && action !== "list") {
    abort("--bare is only valid with the list command", opts);
  }

  return { opts, action: action!, branches, filterPattern };
}

async function main() {
  const argv = process.argv.slice(2);
  const { opts, action, branches, filterPattern } = parseArgs(argv);

  // Runs anywhere (no repo needed) and must not touch stdout beyond the script,
  // so handle it before the update notice and pre-flight checks.
  if (action === "install-completions") {
    installCompletions(branches[0], opts);
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
    case "prune":
      await cmdPrune(branches, opts);
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
