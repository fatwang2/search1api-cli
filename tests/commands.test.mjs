import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cliPath = fileURLToPath(new URL("../dist/index.js", import.meta.url));

function runCli(...args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
    env: { ...process.env, NO_UPDATE_NOTIFIER: "1" },
  });
}

function assertRetiredCommandsAreAbsent(output) {
  assert.doesNotMatch(output, /\breason(?:ing)?\b/i);
  assert.doesNotMatch(output, /\bmodels?\b/i);
}

test("does not expose retired reasoning or model commands", () => {
  const help = runCli("--help");
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /search \[options\] <query>/);
  assertRetiredCommandsAreAbsent(help.stdout);

  const welcome = runCli();
  assert.equal(welcome.status, 0, welcome.stderr);
  assert.match(welcome.stdout, /Quick start:/);
  assertRetiredCommandsAreAbsent(welcome.stdout);
});
