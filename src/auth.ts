// Token storage and resolution (AUTH-*).
//
// git-fi holds its own `read_api` credential rather than borrowing another
// tool's. Delegating to `glab api` would mean storing no secret at all, but
// glab is built around one token per forge, scoped for everything its owner
// does there — a separate stored token is what makes a read-only context
// possible, which is the point.
import { readFileSync, writeFileSync, mkdirSync, statSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import type { Options } from "./types.js";
import { makeStyle, abort } from "./style.js";

const SCHEMA_VERSION = 1;

/** The only scope git-fi's reads need. Anything else is more than it asked for. */
export const REQUIRED_SCOPE = "read_api";

const API_TIMEOUT_MS = 10000;

// Windows has no POSIX mode bits, so the 0600 guarantee the storage rests on
// (AUTH-04) cannot be made or checked there.
const POSIX_MODES = process.platform !== "win32";

export interface StoredHost {
  token: string;
  scopes: string[];
  expiresAt: string | null;
  storedAt: string;
}

interface Config {
  schemaVersion: number;
  hosts: Record<string, StoredHost>;
}

export function configPath(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "git-fi", "config.json");
}

/**
 * The stored config, or null when there is none. Throws when the file is
 * readable by anyone but its owner (AUTH-04): a 0600 file is only better than
 * an exported variable because fewer processes can read it, so reading one that
 * lost those bits would hand back the guarantee silently.
 */
export function readConfig(): Config | null {
  const file = configPath();

  let raw: string;
  try {
    if (POSIX_MODES) {
      const mode = statSync(file).mode & 0o777;
      if (mode & 0o077) {
        throw new Error(
          `${file} is mode ${mode.toString(8).padStart(4, "0")}, readable beyond its owner.\n` +
            `Run: chmod 600 ${file}`
        );
      }
    }
    raw = readFileSync(file, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }

  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || typeof parsed.hosts !== "object") {
    throw new Error(`${file} is not a git-fi config file`);
  }
  return parsed as Config;
}

function writeConfig(config: Config): void {
  const file = configPath();
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify(config, null, 2) + "\n", {
    mode: 0o600,
  });
  // mkdirSync/writeFileSync apply `mode` only when they create; an existing
  // directory or file keeps whatever it had.
  if (POSIX_MODES) {
    chmodSync(dirname(file), 0o700);
    chmodSync(file, 0o600);
  }
}

export function storeToken(host: string, entry: StoredHost): void {
  const config = readConfig() ?? { schemaVersion: SCHEMA_VERSION, hosts: {} };
  config.schemaVersion = SCHEMA_VERSION;
  config.hosts[host] = entry;
  writeConfig(config);
}

/** Remove the stored entry for `host`. Returns whether there was one. */
export function removeToken(host: string): boolean {
  const config = readConfig();
  if (!config || !config.hosts[host]) return false;
  delete config.hosts[host];
  writeConfig(config);
  return true;
}

export interface TokenResolution {
  token: string;
  source: "config" | "env";
  host: string | null;
  /** A stored token won over a `GITLAB_ACCESS_TOKEN` that was also set. */
  shadowsEnv: boolean;
  /** Recorded at login; absent for an environment token, which records nothing. */
  stored: StoredHost | null;
}

let resolutionCache: TokenResolution | null | undefined;

/**
 * Which token this run uses, and where it came from (AUTH-01, AUTH-02).
 *
 * A stored token is the deliberate credential and an export is the ambient one,
 * so stored wins — except under `$CI`, where the config file is not consulted
 * at all. Not reading it there is stronger than ranking it second: a config
 * file a container image happens to carry cannot supply a pipeline's token
 * even by accident. Memoized so every consumer within a run agrees.
 *
 * `host` is passed in rather than detected here: origin parsing lives in
 * gitlab.ts, which reads its token from this module.
 */
export function resolveToken(host: string | null, opts: Options): TokenResolution | null {
  if (resolutionCache !== undefined) return resolutionCache;
  resolutionCache = computeResolution(host, opts);
  return resolutionCache;
}

/** Drop the memoized resolution. For tests that vary the environment in-process. */
export function resetTokenCache(): void {
  resolutionCache = undefined;
}

function computeResolution(host: string | null, opts: Options): TokenResolution | null {
  // An empty export is not a credential, and must not shadow a stored one.
  const envToken = process.env.GITLAB_ACCESS_TOKEN || null;

  // In a pipeline the config file is not a source, so it is not opened —
  // which also means a mode this run can't act on can't abort it (AUTH-04).
  const readsConfig = !process.env.CI && host !== null;

  let stored: StoredHost | null = null;
  if (readsConfig) {
    try {
      stored = readConfig()?.hosts[host!] ?? null;
    } catch (err) {
      abort((err as Error).message, opts);
    }
  }

  if (stored) {
    return {
      token: stored.token,
      source: "config",
      host,
      shadowsEnv: Boolean(envToken),
      stored,
    };
  }
  if (envToken) {
    return { token: envToken, source: "env", host, shadowsEnv: false, stored: null };
  }
  return null;
}

interface TokenInfo {
  scopes: string[];
  expiresAt: string | null;
}

/**
 * What GitLab says the token carries. A login that cannot reach this endpoint
 * stores nothing: an unvalidated token would be indistinguishable from a
 * validated one on disk, and the scope warning (AUTH-09) is the reason the
 * login path exists at all.
 */
export async function inspectToken(host: string, token: string): Promise<TokenInfo> {
  const res = await fetch(`https://${host}/api/v4/personal_access_tokens/self`, {
    headers: { "PRIVATE-TOKEN": token },
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });

  if (res.status === 401) {
    throw new Error(`${host} rejected the token (HTTP 401). Nothing was stored.`);
  }
  if (!res.ok) {
    throw new Error(
      `${host} returned HTTP ${res.status} for /personal_access_tokens/self: ` +
        `${await res.text()}\nNothing was stored.`
    );
  }

  const body = JSON.parse(await res.text());
  return {
    scopes: Array.isArray(body.scopes) ? body.scopes : [],
    expiresAt: typeof body.expires_at === "string" ? body.expires_at : null,
  };
}

export function tokenFormUrl(host: string): string {
  return (
    `https://${host}/-/user_settings/personal_access_tokens` +
    `?name=git-fi&scopes=${REQUIRED_SCOPE}`
  );
}

/** The last 4 characters, which is all `--auth` ever prints of a token (AUTH-11). */
export function tokenTail(token: string): string {
  return token.length <= 4 ? token : token.slice(-4);
}

/** Scopes the token carries that git-fi does not need (AUTH-09). */
export function excessScopes(scopes: string[]): string[] {
  return scopes.filter((s) => s !== REQUIRED_SCOPE);
}

/**
 * Read a token from stdin, never from argv (AUTH-08): an argument is visible in
 * `ps` and lands in shell history. At a TTY the echo is disabled so the value
 * does not stay on screen; off a TTY this reads a pipe, so a password manager
 * can feed it.
 */
function readSecret(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;

    if (!stdin.isTTY) {
      let piped = "";
      stdin.setEncoding("utf-8");
      stdin.on("data", (chunk) => (piped += chunk));
      stdin.on("end", () => resolve(piped.trim()));
      stdin.on("error", reject);
      stdin.resume();
      return;
    }

    process.stderr.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf-8");

    let value = "";
    const finish = (result: string) => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stderr.write("\n");
      resolve(result);
    };

    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return finish(value.trim());
        if (ch === "\x03") {
          stdin.setRawMode(false);
          process.stderr.write("\n");
          process.exit(130);
        }
        // Backspace / delete, so a mistyped paste is recoverable without echo.
        if (ch === "\x7f" || ch === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += ch;
      }
    };

    stdin.on("data", onData);
  });
}

/**
 * The host `--auth` acts on (AUTH-07). The caller has already preferred
 * `--host` over the origin remote; reaching here with neither is the case the
 * override exists for, so the message names it.
 */
function requireHost(host: string | null, opts: Options): string {
  if (host) return host;
  abort(
    "No GitLab origin detected in this directory.\n" +
      "Run --auth from a repo whose origin is the GitLab host you mean, " +
      "or name it with --host <hostname>.",
    opts
  );
}

export async function cmdAuth(
  action: string,
  host: string | null,
  opts: Options
): Promise<void> {
  switch (action) {
    case "status":
      return authStatus(host, opts);
    case "login":
      return authLogin(host, opts);
    case "logout":
      return authLogout(host, opts);
    default:
      abort(`Unknown --auth action: ${action} (expected login, status, or logout)`, opts);
  }
}

/**
 * Report the live token (AUTH-11) through the same resolver every other reader
 * uses, so status cannot describe a precedence the rest of the run does not
 * follow. Issues no network request: it prints what login recorded, which
 * answers offline and instantly.
 */
function authStatus(hostArg: string | null, opts: Options): void {
  const s = makeStyle(opts);
  const host = requireHost(hostArg, opts);
  const resolved = resolveToken(host, opts);

  const inCI = Boolean(process.env.CI);
  process.stdout.write(`Host:    ${s.cyan(host)}\n`);

  if (!resolved) {
    process.stdout.write(`Token:   ${s.dim("none")}\n\n`);
    process.stdout.write(
      inCI
        ? `No GITLAB_ACCESS_TOKEN set. Under $CI that is the only source — ` +
            `${configPath()} is not read.\n`
        : `No token for this host. Run ${s.bold("git fi --auth=login")} to store one.\n`
    );
    return;
  }

  process.stdout.write(
    `Source:  ${
      resolved.source === "config"
        ? `stored in ${configPath()}`
        : `GITLAB_ACCESS_TOKEN${inCI ? " (the only source under $CI)" : ""}`
    }\n`
  );

  if (resolved.stored) {
    const scopes = resolved.stored.scopes.length
      ? resolved.stored.scopes.join(", ")
      : "none reported";
    process.stdout.write(`Scopes:  ${scopes}\n`);
    process.stdout.write(`Expires: ${resolved.stored.expiresAt ?? "never"}\n`);
  } else {
    // An exported token was never inspected by git-fi, so naming scopes for it
    // would be inventing them (AUTH-11).
    process.stdout.write(`Scopes:  ${s.dim("not recorded for an exported token")}\n`);
  }

  process.stdout.write(`Token:   ...${tokenTail(resolved.token)}\n`);

  if (resolved.shadowsEnv) {
    process.stdout.write(
      `\n${s.yellow("GITLAB_ACCESS_TOKEN is set and being ignored")} in favour of the stored token.\n` +
        `Run ${s.bold("git fi --auth=logout")} to use the exported one instead.\n`
    );
  }

  const excess = resolved.stored ? excessScopes(resolved.stored.scopes) : [];
  if (excess.length > 0) {
    process.stdout.write(
      `\n${s.yellow("This token is broader than git-fi needs")}: it carries ${excess.join(", ")}.\n` +
        `git-fi only reads, so ${REQUIRED_SCOPE} alone is enough.\n`
    );
  }
}

async function authLogin(hostArg: string | null, opts: Options): Promise<void> {
  const s = makeStyle(opts);
  const host = requireHost(hostArg, opts);

  process.stderr.write(`Storing a GitLab token for ${s.cyan(host)}.\n`);
  process.stderr.write(
    `Create a ${s.bold(REQUIRED_SCOPE)} token here:\n  ` +
      `${s.link(tokenFormUrl(host), tokenFormUrl(host))}\n\n`
  );

  const token = await readSecret("Paste token: ");
  if (!token) {
    abort("No token given; nothing was stored.", opts);
  }

  let info: TokenInfo;
  try {
    info = await inspectToken(host, token);
  } catch (err) {
    abort((err as Error).message, opts);
  }

  storeToken(host, {
    token,
    scopes: info.scopes,
    expiresAt: info.expiresAt,
    storedAt: new Date().toISOString(),
  });

  process.stdout.write(
    `${s.greenBold("Stored")} token ...${tokenTail(token)} for ${s.cyan(host)} ` +
      `in ${configPath()}\n`
  );

  const excess = excessScopes(info.scopes);
  if (excess.length > 0) {
    process.stdout.write(
      `\n${s.yellow("That token is broader than git-fi needs")}: it carries ${excess.join(", ")}.\n` +
        `git-fi only reads pipeline status, so a ${REQUIRED_SCOPE} token is enough:\n  ` +
        `${s.link(tokenFormUrl(host), tokenFormUrl(host))}\n`
    );
  }
}

function authLogout(hostArg: string | null, opts: Options): void {
  const s = makeStyle(opts);
  const host = requireHost(hostArg, opts);

  let removed: boolean;
  try {
    removed = removeToken(host);
  } catch (err) {
    abort((err as Error).message, opts);
  }

  if (!removed) {
    process.stdout.write(`No stored token for ${s.cyan(host)}.\n`);
    return;
  }
  process.stdout.write(`Removed the stored token for ${s.cyan(host)}.\n`);

  if (process.env.GITLAB_ACCESS_TOKEN) {
    process.stdout.write(`GITLAB_ACCESS_TOKEN is set; git-fi will use it for this host.\n`);
  }
}
