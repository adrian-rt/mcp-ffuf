import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { __test__, fuzzPath } from "../src/ffuf.js";

const { validateWordlist, validateCodeList, validateExtensions, parseResults } = __test__;

test("validateWordlist rejects relative path", async () => {
  await assert.rejects(() => validateWordlist("wordlists/common.txt"), /absolute/);
});

test("validateWordlist rejects missing path", async () => {
  await assert.rejects(() => validateWordlist("/does/not/exist/wordlist.txt"), /not readable/);
});

test("validateWordlist accepts readable absolute path", async () => {
  const path = await validateWordlist("/etc/hosts");
  assert.equal(path, "/etc/hosts");
});

test("validateCodeList rejects shell metacharacters", () => {
  assert.throws(() => validateCodeList("200;ls", "match_codes"));
  assert.throws(() => validateCodeList("200 || curl evil", "match_codes"));
});

test("validateCodeList accepts valid input", () => {
  assert.equal(validateCodeList("200,301,401", "match_codes"), "200,301,401");
  assert.equal(validateCodeList(null, "match_codes"), null);
});

test("validateExtensions rejects bad chars", () => {
  assert.throws(() => validateExtensions(".php;cat /etc/passwd"));
});

test("validateExtensions accepts valid list", () => {
  assert.equal(validateExtensions(".php,.html,.asp"), ".php,.html,.asp");
});

test("parseResults handles empty output", () => {
  assert.deepEqual(parseResults(""), { results: [] });
  assert.deepEqual(parseResults("   "), { results: [] });
});

test("parseResults handles valid JSON", () => {
  const out = JSON.stringify({ results: [{ url: "x", status: 200 }] });
  assert.deepEqual(parseResults(out), { results: [{ url: "x", status: 200 }] });
});

test("parseResults tolerates garbage", () => {
  const r = parseResults("not json at all");
  assert.deepEqual(r.results, []);
  assert.ok(r.raw);
});

test("fuzzPath reads structured JSON from ffuf output file, not quiet stdout", { skip: process.platform === "win32" }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "mcp-ffuf-test-"));
  const oldPath = process.env.PATH;
  try {
    const wordlist = join(dir, "words.txt");
    const fake = join(dir, "ffuf");
    await writeFile(wordlist, "health\n");
    await writeFile(fake, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const output = args[args.indexOf('-o') + 1];
if (!output || output === '-') process.exit(2);
fs.writeFileSync(output, JSON.stringify({ results: [{ url: 'http://127.0.0.1/health', status: 200 }] }));
process.stdout.write('health\\n');
`);
    await chmod(fake, 0o755);
    process.env.PATH = dir + delimiter + oldPath;
    const result = await fuzzPath({ url: "http://127.0.0.1/FUZZ", wordlist, timeoutMs: 5000 });
    assert.deepEqual(result.results, [{ url: "http://127.0.0.1/health", status: 200 }]);
  } finally {
    if (oldPath === undefined) delete process.env.PATH;
    else process.env.PATH = oldPath;
    await rm(dir, { recursive: true, force: true });
  }
});
