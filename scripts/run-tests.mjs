// Discovers the test files and hands them to node's test runner.
//
// Node expands a quoted glob itself, so this exists for what it does when the
// glob matches nothing: report `tests 0` and exit 0. A pattern that drifts —
// a renamed directory, a changed suffix — then reads as a green suite that ran
// nothing, which is the one test-harness failure no test can catch.
// Passing explicit paths also keeps the shell out of it, so `npm test` behaves
// the same under sh and cmd.
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const testDir = fileURLToPath(new URL("../test", import.meta.url));
const files = readdirSync(testDir)
  .filter((f) => f.endsWith(".test.ts"))
  .sort()
  .map((f) => join(testDir, f));

// A discovery bug that finds nothing looks exactly like a green suite, so say so.
if (files.length === 0) {
  process.stderr.write(`No *.test.ts files found in ${testDir}\n`);
  process.exit(1);
}

const r = spawnSync(process.execPath, ["--import", "tsx", "--test", ...files], {
  stdio: "inherit",
});
process.exit(r.status ?? 1);
