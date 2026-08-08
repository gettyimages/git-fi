import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, statSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  configPath,
  readConfig,
  storeToken,
  removeToken,
  resolveToken,
  resetTokenCache,
  excessScopes,
  tokenTail,
  tokenFormUrl,
} from "../src/auth.js";

const OPTS = { debug: false, bare: false, json: false, select: false, yes: false };
const POSIX_MODES = process.platform !== "win32";

const HOST = "gitlab.example.com";
const ENTRY = {
  token: "glpat-abcdefghij1234",
  scopes: ["read_api"],
  expiresAt: "2027-01-01",
  storedAt: "2026-08-08T00:00:00.000Z",
};

let home: string;
let savedXdg: string | undefined;
let savedEnvToken: string | undefined;
let savedCI: string | undefined;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "git-fi-auth-"));
  savedXdg = process.env.XDG_CONFIG_HOME;
  savedEnvToken = process.env.GITLAB_ACCESS_TOKEN;
  savedCI = process.env.CI;
  process.env.XDG_CONFIG_HOME = home;
  delete process.env.GITLAB_ACCESS_TOKEN;
  delete process.env.CI;
  resetTokenCache();
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  restore("XDG_CONFIG_HOME", savedXdg);
  restore("GITLAB_ACCESS_TOKEN", savedEnvToken);
  restore("CI", savedCI);
  resetTokenCache();
});

describe("configPath (AUTH-03)", () => {
  test("honors XDG_CONFIG_HOME", () => {
    assert.equal(configPath(), join(home, "git-fi", "config.json"));
  });

  test("falls back to ~/.config", () => {
    delete process.env.XDG_CONFIG_HOME;
    assert.match(configPath(), /\.config[/\\]git-fi[/\\]config\.json$/);
  });
});

describe("storage (AUTH-03, AUTH-04)", () => {
  test("no config file reads as no config, not an error", () => {
    assert.equal(readConfig(), null);
  });

  test("a stored token round-trips under its host, stamped with a schema version", () => {
    storeToken(HOST, ENTRY);
    const config = readConfig();
    assert.equal(config!.schemaVersion, 1);
    assert.deepEqual(config!.hosts[HOST], ENTRY);
  });

  test("a second host is added alongside the first, not over it", () => {
    storeToken(HOST, ENTRY);
    storeToken("gitlab.com", { ...ENTRY, token: "glpat-second" });
    const hosts = readConfig()!.hosts;
    assert.deepEqual(Object.keys(hosts).sort(), ["gitlab.com", HOST].sort());
    assert.equal(hosts[HOST].token, ENTRY.token);
  });

  test("logout removes only the named host", () => {
    storeToken(HOST, ENTRY);
    storeToken("gitlab.com", { ...ENTRY, token: "glpat-second" });
    assert.equal(removeToken(HOST), true);
    assert.deepEqual(Object.keys(readConfig()!.hosts), ["gitlab.com"]);
  });

  test("logout on a host with nothing stored reports that, and does not throw", () => {
    storeToken(HOST, ENTRY);
    assert.equal(removeToken("nowhere.example.com"), false);
  });

  (POSIX_MODES ? test : test.skip)("the file is written 0600 and its directory 0700", () => {
    storeToken(HOST, ENTRY);
    assert.equal(statSync(configPath()).mode & 0o777, 0o600);
    assert.equal(statSync(join(home, "git-fi")).mode & 0o777, 0o700);
  });

  (POSIX_MODES ? test : test.skip)(
    "a directory that already exists too open is tightened on write",
    () => {
      mkdirSync(join(home, "git-fi"), { recursive: true, mode: 0o755 });
      chmodSync(join(home, "git-fi"), 0o755);
      storeToken(HOST, ENTRY);
      assert.equal(statSync(join(home, "git-fi")).mode & 0o777, 0o700);
    }
  );

  (POSIX_MODES ? test : test.skip)(
    "a group- or world-readable file is refused, naming the chmod that fixes it",
    () => {
      storeToken(HOST, ENTRY);
      chmodSync(configPath(), 0o644);
      assert.throws(() => readConfig(), /readable beyond its owner[\s\S]*chmod 600/);
    }
  );

  test("a file that is not a git-fi config is refused rather than half-read", () => {
    mkdirSync(join(home, "git-fi"), { recursive: true });
    writeFileSync(configPath(), JSON.stringify({ nope: true }), { mode: 0o600 });
    assert.throws(() => readConfig(), /not a git-fi config file/);
  });
});

describe("resolution order (AUTH-01)", () => {
  test("nothing stored and nothing exported resolves to no token", () => {
    assert.equal(resolveToken(HOST, OPTS), null);
  });

  test("the export is used when nothing is stored", () => {
    process.env.GITLAB_ACCESS_TOKEN = "glpat-from-env";
    const r = resolveToken(HOST, OPTS)!;
    assert.equal(r.source, "env");
    assert.equal(r.token, "glpat-from-env");
    assert.equal(r.stored, null);
  });

  test("the stored token outranks the export at a developer's terminal", () => {
    storeToken(HOST, ENTRY);
    process.env.GITLAB_ACCESS_TOKEN = "glpat-from-env";
    const r = resolveToken(HOST, OPTS)!;
    assert.equal(r.source, "config");
    assert.equal(r.token, ENTRY.token);
    assert.equal(r.shadowsEnv, true, "status has to be able to say the export is ignored");
  });

  test("under $CI the job's variable is what applies", () => {
    storeToken(HOST, ENTRY);
    process.env.GITLAB_ACCESS_TOKEN = "glpat-from-env";
    process.env.CI = "true";
    const r = resolveToken(HOST, OPTS)!;
    assert.equal(r.source, "env");
    assert.equal(r.token, "glpat-from-env");
  });

  test("under $CI a stored token is not a source at all, even with no variable set", () => {
    storeToken(HOST, ENTRY);
    process.env.CI = "true";
    assert.equal(
      resolveToken(HOST, OPTS),
      null,
      "a config file an image happens to carry must not supply a pipeline's token"
    );
  });

  test("under $CI a config too open to read cannot abort the run, since it is never opened", () => {
    if (!POSIX_MODES) return;
    storeToken(HOST, ENTRY);
    chmodSync(join(home, "git-fi", "config.json"), 0o644);
    process.env.GITLAB_ACCESS_TOKEN = "glpat-from-env";
    process.env.CI = "true";
    assert.equal(resolveToken(HOST, OPTS)!.source, "env");
  });

  test("an empty export is absent, and does not shadow a stored token", () => {
    storeToken(HOST, ENTRY);
    process.env.GITLAB_ACCESS_TOKEN = "";
    const r = resolveToken(HOST, OPTS)!;
    assert.equal(r.source, "config");
    assert.equal(r.shadowsEnv, false);
  });

  test("an empty export with nothing stored is no token at all", () => {
    process.env.GITLAB_ACCESS_TOKEN = "";
    assert.equal(resolveToken(HOST, OPTS), null);
  });

  test("a token stored for one host is not offered to another", () => {
    storeToken(HOST, ENTRY);
    assert.equal(resolveToken("gitlab.com", OPTS), null);
  });

  test("an undetectable host falls through to the export rather than guessing", () => {
    storeToken(HOST, ENTRY);
    process.env.GITLAB_ACCESS_TOKEN = "glpat-from-env";
    const r = resolveToken(null, OPTS)!;
    assert.equal(r.source, "env");
  });

  test("the resolution is memoized, so every consumer in a run sees one answer", () => {
    process.env.GITLAB_ACCESS_TOKEN = "glpat-first";
    assert.equal(resolveToken(HOST, OPTS)!.token, "glpat-first");
    process.env.GITLAB_ACCESS_TOKEN = "glpat-second";
    assert.equal(resolveToken(HOST, OPTS)!.token, "glpat-first");
  });
});

describe("scope reporting (AUTH-09, AUTH-11)", () => {
  test("read_api alone is exactly what git-fi asks for", () => {
    assert.deepEqual(excessScopes(["read_api"]), []);
  });

  test("a full api token is named as broader than needed", () => {
    assert.deepEqual(excessScopes(["api"]), ["api"]);
  });

  test("the excess is reported without the scope that was wanted", () => {
    assert.deepEqual(excessScopes(["read_api", "write_repository"]), ["write_repository"]);
  });

  test("only the last 4 characters of a token are ever shown", () => {
    assert.equal(tokenTail("glpat-abcdefghij1234"), "1234");
  });

  test("a token too short to trim is not padded into looking longer", () => {
    assert.equal(tokenTail("abc"), "abc");
  });
});

describe("token form link (AUTH-10)", () => {
  test("prefills the name and the read_api scope for the detected host", () => {
    assert.equal(
      tokenFormUrl(HOST),
      `https://${HOST}/-/user_settings/personal_access_tokens?name=git-fi&scopes=read_api`
    );
  });
});
