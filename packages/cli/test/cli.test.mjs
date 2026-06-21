import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const cliPath = resolve("dist/index.js");

async function runCli(args, options = {}) {
  return execFileAsync(process.execPath, [cliPath, ...args], {
    cwd: options.cwd ?? process.cwd(),
    env: {
      ...process.env,
      ...options.env
    }
  });
}

async function createConfiguredProject() {
  const cwd = await mkdtemp(join(tmpdir(), "openext-cli-"));

  await writeFile(
    join(cwd, "openext.config.mjs"),
    `
      export default {
        name: "CLI Test",
        version: "0.1.0",
        targets: {
          chrome: {},
          firefox: {}
        },
        permissions: {
          required: ["storage", "tabs"],
          host: ["https://example.com/*"]
        },
        entrypoints: {
          background: "src/background.ts"
        }
      };
    `
  );
  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(join(cwd, "src/background.ts"), "console.log('background');\n");

  return cwd;
}

test("CLI help prints commands", async () => {
  const result = await runCli(["--help"]);

  assert.match(result.stdout, /openext/);
  assert.match(result.stdout, /init/);
  assert.match(result.stdout, /doctor/);
});

test("init creates a vanilla project", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "openext-init-"));

  try {
    const result = await runCli(["init", "sample-extension"], { cwd });
    const config = await readFile(join(cwd, "sample-extension/openext.config.ts"), "utf8");
    const packageJson = await readFile(join(cwd, "sample-extension/package.json"), "utf8");

    assert.match(result.stdout, /Created sample-extension/);
    assert.match(config, /defineOpenExtConfig/);
    assert.match(packageJson, /sample-extension/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor runs with JSON output", async () => {
  const cwd = await createConfiguredProject();

  try {
    const result = await runCli(["doctor", "--json"], { cwd });
    const parsed = JSON.parse(result.stdout);

    assert.equal(parsed.checks.some((check) => check.name === "config" && check.ok), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("inspect manifest works", async () => {
  const cwd = await createConfiguredProject();

  try {
    const result = await runCli(["inspect", "manifest", "chrome", "--json"], { cwd });
    const manifest = JSON.parse(result.stdout);

    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.background.service_worker, "src/background.ts");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("inspect permissions works", async () => {
  const cwd = await createConfiguredProject();

  try {
    const result = await runCli(["inspect", "permissions", "chrome", "--json"], { cwd });
    const report = JSON.parse(result.stdout);

    assert.equal(report.findings.some((finding) => finding.code === "permission.tabs"), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("build writes target manifest", async () => {
  const cwd = await createConfiguredProject();

  try {
    await runCli(["build", "chrome"], { cwd });
    const manifest = JSON.parse(await readFile(join(cwd, "dist/chrome/manifest.json"), "utf8"));

    assert.equal(manifest.name, "CLI Test");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("package writes target zip", async () => {
  const cwd = await createConfiguredProject();

  try {
    await runCli(["package", "chrome"], { cwd });
    const zip = await readFile(join(cwd, "dist/packages/cli-test-chrome.zip"));

    assert.equal(zip.subarray(0, 2).toString("utf8"), "PK");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("invalid target fails", async () => {
  const cwd = await createConfiguredProject();

  try {
    await assert.rejects(() => runCli(["inspect", "manifest", "opera"], { cwd }), /Invalid target/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("missing config fails clearly", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "openext-empty-"));

  try {
    await assert.rejects(() => runCli(["inspect", "manifest"], { cwd }), /No OpenExtKit config/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
