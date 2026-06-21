import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveOpenExtProject } from "@openextkit/core";
import {
  createTestProfile,
  createTestReport,
  loadExtensionInBrowser,
  runAllBrowserSmokeTests,
  runBrowserSmokeTest
} from "../dist/index.js";

async function createProject(options = {}) {
  const cwd = await mkdtemp(join(tmpdir(), "openext-testing-"));
  const targets = options.targets ?? {
    chrome: {},
    firefox: {}
  };

  await writeFile(
    join(cwd, "openext.config.mjs"),
    `
      export default {
        name: "Testing Fixture",
        version: "0.1.0",
        targets: ${JSON.stringify(targets)},
        entrypoints: {
          background: "src/background.js",
          popup: "src/popup.html",
          contentScripts: [
            {
              matches: ["https://example.com/*"],
              js: ["src/content.js"],
              css: ["src/content.css"]
            }
          ]
        }
      };
    `
  );

  if (options.built !== false) {
    for (const target of Object.keys(targets)) {
      await writeBuildOutput(cwd, target);
    }
  }

  return cwd;
}

async function writeBuildOutput(cwd, target) {
  await mkdir(join(cwd, "dist", target, "src"), { recursive: true });
  await writeFile(
    join(cwd, "dist", target, "manifest.json"),
    JSON.stringify({
      manifest_version: 3,
      name: "Testing Fixture",
      version: "0.1.0",
      background: {
        service_worker: "src/background.js"
      }
    })
  );
  await writeFile(join(cwd, "dist", target, "src/background.js"), "console.log('background');\n");
  await writeFile(join(cwd, "dist", target, "src/popup.html"), "<main>Popup</main>\n");
  await writeFile(join(cwd, "dist", target, "src/content.js"), "console.log('content');\n");
  await writeFile(join(cwd, "dist", target, "src/content.css"), "body { color: black; }\n");
}

test("report schema includes target status checks warnings errors and duration", async () => {
  const cwd = await createProject();

  try {
    const project = await resolveOpenExtProject(cwd);
    const result = await runBrowserSmokeTest(project, "chrome");

    assert.equal(result.target, "chrome");
    assert.match(result.status, /passed|warning|failed/);
    assert.equal(Array.isArray(result.checks), true);
    assert.equal(Array.isArray(result.warnings), true);
    assert.equal(Array.isArray(result.errors), true);
    assert.equal(typeof result.durationMs, "number");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("missing build output fails clearly", async () => {
  const cwd = await createProject({ built: false });

  try {
    const project = await resolveOpenExtProject(cwd);
    const result = await runBrowserSmokeTest(project, "chrome");

    assert.equal(result.status, "failed");
    assert.match(result.errors.join("\n"), /Run openext build first/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Chrome smoke runner validates manifest and reports launch skip by default", async () => {
  const cwd = await createProject();

  try {
    const project = await resolveOpenExtProject(cwd);
    const result = await runBrowserSmokeTest(project, "chrome");

    assert.equal(result.checks.some((check) => check.name === "manifest.valid" && check.status === "passed"), true);
    assert.equal(result.warnings.some((warning) => /Browser launch skipped/.test(warning)), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Firefox smoke runner reports fallback structure", async () => {
  const cwd = await createProject();

  try {
    const project = await resolveOpenExtProject(cwd);
    const result = await runBrowserSmokeTest(project, "firefox");

    assert.equal(result.checks.some((check) => check.name === "browser.capability"), true);
    assert.match(result.warnings.join("\n"), /Firefox fallback smoke tests/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("unsupported capability warning is explicit", async () => {
  const result = await loadExtensionInBrowser("safari", "/tmp/extension");

  assert.equal(result.loaded, false);
  assert.match(result.warnings.join("\n"), /unsupported capability/);
});

test("testing package reads target capabilities", async () => {
  const cwd = await createProject({ targets: { safari: {} } });

  try {
    const project = await resolveOpenExtProject(cwd);
    const result = await runBrowserSmokeTest(project, "safari");

    assert.equal(result.checks.some((check) => check.name === "browser.capability"), true);
    assert.match(result.warnings.join("\n"), /unsupported capability/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("test all aggregates results and writes a report", async () => {
  const cwd = await createProject();

  try {
    const project = await resolveOpenExtProject(cwd);
    const report = await runAllBrowserSmokeTests(project);
    const written = JSON.parse(await readFile(join(cwd, "dist/reports/test-report.json"), "utf8"));

    assert.equal(report.targets.length, 2);
    assert.deepEqual(written.targets.map((entry) => entry.target), ["chrome", "firefox"]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("createTestProfile uses an isolated temp browser profile", async () => {
  const profile = await createTestProfile("chrome");

  try {
    assert.equal(profile.target, "chrome");
    assert.match(profile.profileDir, /openext-chrome-profile-/);
  } finally {
    await rm(profile.profileDir, { recursive: true, force: true });
  }
});

test("createTestReport returns a structured aggregate report", async () => {
  const cwd = await createProject();

  try {
    const project = await resolveOpenExtProject(cwd);
    const report = await createTestReport(project);

    assert.equal(report.project.name, "Testing Fixture");
    assert.match(report.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(report.targets.length, 2);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
