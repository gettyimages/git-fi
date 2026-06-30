#!/usr/bin/env node
import { createRequire } from "node:module";
import type { Options } from "./types.js";
import { abort } from "./style.js";
import { preflightChecks, ensureFetched } from "./git.js";
import { cmdList, cmdAdd, cmdRemove, cmdForce, cmdAgain, cmdPrune, cmdAbort, cmdSelect } from "./commands.js";
import { notifyUpdate } from "./update-check.js";

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
        process.stdout.write(
          `Usage: git fi [options] [<branch>...]\n` +
          `\n` +
          `Maintain a temporary integration branch for early conflict detection.\n` +
          `\n` +
          `Actions:\n` +
          `  -a, --add       Add branch(es) to fi\n` +
          `  -r, --remove    Remove branch(es) from fi\n` +
          `  -f, --force     Replace fi contents with only the given branch(es)\n` +
          `  -g, --again     Re-merge all branches currently in fi\n` +
          `  -p, --prune     Remove dead/already-merged branches from fi\n` +
          `  -A, --abort     Re-pull fi from origin\n` +
          `\n` +
          `Options:\n` +
          `  -d, --debug     Print git commands as they execute\n` +
          `  -b, --bare      Machine-readable output (space-separated branch names)\n` +
          `  -j, --json      Structured JSON output for list\n` +
          `  -s, --select    Interactive branch picker\n` +
          `  -y, --yes       Bootstrap fi without the confirmation prompt (for CI/scripts)\n` +
          `  -V, --version   Print version and exit\n` +
          `  -h, --help      Show this help\n` +
          `\n` +
          `Full documentation: https://gettyimages.github.io/git-fi/\n`
        );
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
        if (arg.startsWith("-")) {
          abort(`Unknown option: ${arg}`, opts);
        }
        branches.push(arg);
        break;
    }
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

  preflightChecks(opts);
  notifyUpdate(name, version, opts);

  if (action !== "list") {
    await ensureFetched(opts);
  }

  switch (action) {
    case "list":
      await ensureFetched(opts);
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
