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
        description: "CLI test description.",
        targets: {
          chrome: {},
          firefox: {}
        },
        permissions: {
          required: ["storage", "tabs"],
          host: ["https://example.com/*"]
        },
        entrypoints: {
          background: "src/background.ts",
          popup: "src/popup.html"
        }
      };
    `
  );
  await writeFile(join(cwd, "README.md"), "# CLI Test\n");
  await writeFile(join(cwd, "LICENSE"), "MIT\n");
  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(join(cwd, "src/background.ts"), "console.log('background');\n");
  await writeFile(join(cwd, "src/popup.html"), "<main>Popup</main>\n");

  return cwd;
}

test("CLI help prints commands", async () => {
  const result = await runCli(["--help"]);

  assert.match(result.stdout, /openext/);
  assert.match(result.stdout, /init/);
  assert.match(result.stdout, /doctor/);
  assert.match(result.stdout, /dashboard/);
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

test("init creates a rich template project", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "openext-init-rich-"));

  try {
    const result = await runCli(["init", "sidebar-extension", "--template", "ai-sidebar"], { cwd });
    const content = await readFile(join(cwd, "sidebar-extension/src/content.ts"), "utf8");
    const config = await readFile(join(cwd, "sidebar-extension/openext.config.ts"), "utf8");

    assert.match(result.stdout, /Created sidebar-extension/);
    assert.match(content, /AI Sidebar/);
    assert.match(config, /activeTab/);
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

test("doctor target reports browser-specific diagnostics", async () => {
  const cwd = await createConfiguredProject();

  try {
    const result = await runCli(["doctor", "--target", "chrome", "--json"], { cwd });
    const parsed = JSON.parse(result.stdout);

    assert.equal(parsed.checks.some((check) => check.name === "target.enabled" && check.ok), true);
    assert.equal(parsed.checks.some((check) => check.name === "browser.executable" && !check.ok), true);
    assert.equal(parsed.checks.some((check) => check.name === "visual.screenshots"), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor target rejects invalid targets", async () => {
  const cwd = await createConfiguredProject();

  try {
    await assert.rejects(() => runCli(["doctor", "--target", "brave"], { cwd }), /Invalid target/);
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
    const result = await runCli(["inspect", "permissions", "chrome", "--advisor", "--json"], { cwd });
    const report = JSON.parse(result.stdout);

    assert.equal(report.findings.some((finding) => finding.code === "permission.tabs"), true);
    assert.equal(report.advisor.some((entry) => entry.permission === "tabs"), true);
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

test("dev once builds then reports missing browser executable", async () => {
  const cwd = await createConfiguredProject();

  try {
    await assert.rejects(
      () => runCli(["dev", "chrome", "--once"], {
        cwd,
        env: {
          OPENEXTKIT_CHROME_EXECUTABLE: ""
        }
      }),
      /OPENEXTKIT_CHROME_EXECUTABLE/
    );
    const manifest = JSON.parse(await readFile(join(cwd, "dist/chrome/manifest.json"), "utf8"));

    assert.equal(manifest.name, "CLI Test");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("dev reports unsupported browser automation targets", async () => {
  const cwd = await createConfiguredProject();

  try {
    await assert.rejects(() => runCli(["dev", "firefox", "--once"], { cwd }), /does not support automated extension loading/);
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

test("test all writes browser smoke report", async () => {
  const cwd = await createConfiguredProject();

  try {
    await runCli(["build", "all"], { cwd });
    const result = await runCli(["test", "all"], { cwd });
    const report = JSON.parse(await readFile(join(cwd, "dist/reports/test-report.json"), "utf8"));

    assert.match(result.stdout, /Smoke-tested targets/);
    assert.deepEqual(report.targets.map((entry) => entry.target), ["chrome", "firefox"]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("visual all reports missing browser executable clearly", async () => {
  const cwd = await createConfiguredProject();

  try {
    await runCli(["build", "all"], { cwd });
    const result = await runCli(["visual", "all"], {
      cwd,
      env: {
        OPENEXTKIT_CHROME_EXECUTABLE: ""
      }
    });
    const report = JSON.parse(await readFile(join(cwd, "dist/reports/visual-test-report.json"), "utf8"));

    assert.match(result.stdout, /Visual-tested targets/);
    assert.equal(report.targets.some((entry) => entry.target === "chrome" && entry.status === "failed"), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("targets commands expose browser capabilities", async () => {
  const list = await runCli(["targets"]);
  const inspect = await runCli(["targets", "inspect", "opera"]);

  assert.match(list.stdout, /Chrome/);
  assert.match(list.stdout, /Opera/);
  assert.match(inspect.stdout, /supportsManifestV3/);
});

test("templates command exposes marketplace metadata", async () => {
  const result = await runCli(["templates", "--json"]);
  const parsed = JSON.parse(result.stdout);

  assert.equal(parsed.templates.some((entry) => entry.name === "web-clipper" && entry.category), true);
});

test("compat fix suggests changes without writing files", async () => {
  const cwd = await createConfiguredProject();

  try {
    const result = await runCli(["compat", "fix", "firefox", "--dry-run", "--json"], { cwd });
    const parsed = JSON.parse(result.stdout);

    assert.equal(parsed.dryRun, true);
    assert.equal(parsed.suggestions.some((entry) => entry.code === "host.broad"), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("release commands write publish readiness artifacts", async () => {
  const cwd = await createConfiguredProject();

  try {
    const assets = await runCli(["store-assets"], { cwd });
    const check = await runCli(["publish-check"], { cwd });
    const review = await runCli(["review", "all", "--json"], { cwd });
    const wizard = await runCli(["publish-wizard", "all", "--json"], { cwd });
    const report = await runCli(["release-report"], { cwd });
    const description = await readFile(join(cwd, "dist/store/chrome/full-description.md"), "utf8");
    const markdown = await readFile(join(cwd, "dist/reports/release-report.md"), "utf8");
    const json = JSON.parse(await readFile(join(cwd, "dist/reports/release-report.json"), "utf8"));
    const parsedCheck = JSON.parse(check.stdout);
    const parsedReview = JSON.parse(review.stdout);
    const parsedWizard = JSON.parse(wizard.stdout);

    assert.match(assets.stdout, /Store metadata written/);
    assert.match(report.stdout, /Release report written/);
    assert.match(description, /CLI test description/);
    assert.match(markdown, /Release Report/);
    assert.match(markdown, /Store Readiness/);
    assert.equal(json.project.name, "CLI Test");
    assert.equal(typeof json.publishCheck.readiness.percentage, "number");
    assert.equal(typeof parsedCheck.readiness.percentage, "number");
    assert.equal(parsedReview.targets.some((entry) => entry.target === "chrome"), true);
    assert.equal(parsedWizard.items.some((entry) => entry.target === "chrome"), true);
    assert.equal(parsedCheck.checks.some((entry) => entry.name === "package.exists"), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("invalid target fails", async () => {
  const cwd = await createConfiguredProject();

  try {
    await assert.rejects(() => runCli(["inspect", "manifest", "brave"], { cwd }), /Invalid target/);
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
