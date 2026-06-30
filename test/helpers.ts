import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DIST_INDEX = fileURLToPath(new URL("../dist/index.js", import.meta.url));

export interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

/** Run the compiled git-fi binary in `cwd`. Never throws on non-zero exit. */
export function runFi(
  args: string[],
  cwd: string,
  extraEnv: Record<string, string> = {}
): RunResult {
  // Start from a clean slate so the host's CI / GitLab / color settings can't
  // leak into the assertions; tests opt back into those vars explicitly.
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  delete env.CI;
  delete env.CI_PIPELINE_ID;
  delete env.CI_COMMIT_REF_NAME;
  delete env.GITLAB_ACCESS_TOKEN;
  delete env.GIT_FI_NO_HINTS;
  env.NO_COLOR = "1";

  // spawnSync (not execFileSync) so both stdout and stderr are captured
  // regardless of exit code — success-path messages land on stderr too.
  const r = spawnSync(process.execPath, [DIST_INDEX, ...args], {
    cwd,
    encoding: "utf-8",
    env: { ...env, ...extraEnv },
    stdio: ["pipe", "pipe", "pipe"],
  });
  return {
    status: r.status ?? 1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

function git(repo: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repo,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trimEnd();
}

export interface Sandbox {
  /** Working clone — run git-fi here. */
  work: string;
  /** Bare repo acting as `origin`. */
  origin: string;
  /** Create a branch off `main` carrying `file`=`content`, push it, return to main. */
  pushBranch(branch: string, file: string, content: string): void;
  /**
   * Seed an empty `origin/fi` at `main` so the interactive bootstrap prompt is
   * skipped. Represents a repo a human has already bootstrapped — the steady
   * state in which every later command runs.
   */
  bootstrapFi(): void;
  /** Delete a branch from `origin` (simulates a branch that disappeared). */
  deleteRemoteBranch(branch: string): void;
  /** Run a raw git command in the working clone. */
  git(args: string[]): string;
  cleanup(): void;
}

/**
 * Build an isolated playground: a bare `origin` plus a working clone seeded
 * with one commit on `main`. Repo-local config keeps the host's global git
 * config, hooks, and signing settings out of the test.
 */
export function makeSandbox(): Sandbox {
  const root = mkdtempSync(join(tmpdir(), "git-fi-test-"));
  const origin = join(root, "origin.git");
  const work = join(root, "work");

  execFileSync("git", ["init", "--quiet", "--bare", "-b", "main", origin]);
  mkdirSync(work);
  git(work, ["init", "--quiet", "-b", "main"]);
  git(work, ["config", "user.email", "test@example.com"]);
  git(work, ["config", "user.name", "Test"]);
  git(work, ["config", "commit.gpgsign", "false"]);
  git(work, ["config", "core.hooksPath", "/dev/null"]);
  git(work, ["config", "push.default", "simple"]);
  git(work, ["remote", "add", "origin", origin]);

  writeFileSync(join(work, "README.md"), "seed\n");
  git(work, ["add", "."]);
  git(work, ["commit", "--quiet", "-m", "seed"]);
  git(work, ["push", "--quiet", "-u", "origin", "main"]);

  return {
    work,
    origin,
    pushBranch(branch, file, content) {
      git(work, ["checkout", "--quiet", "-b", branch, "main"]);
      writeFileSync(join(work, file), content);
      git(work, ["add", "."]);
      git(work, ["commit", "--quiet", "-m", `${branch}: ${file}`]);
      git(work, ["push", "--quiet", "origin", branch]);
      git(work, ["checkout", "--quiet", "main"]);
    },
    bootstrapFi() {
      git(work, ["push", "--quiet", "origin", "main:fi"]);
      git(work, ["fetch", "--quiet", "origin"]);
    },
    deleteRemoteBranch(branch) {
      git(work, ["push", "--quiet", "origin", "--delete", branch]);
    },
    git(args) {
      return git(work, args);
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
