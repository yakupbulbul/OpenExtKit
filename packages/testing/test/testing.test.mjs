import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveOpenExtProject } from "@openextkit/core";
import {
  applyVisualRegression,
  createTestProfile,
  createTestReport,
  loadExtensionInBrowser,
  runAllBrowserSmokeTests,
  runAllBrowserVisualTests,
  runBrowserVisualTest,
  runBrowserSmokeTest,
  startBrowserDevSession
} from "../dist/index.js";

async function createProject(options = {}) {
  const cwd = await mkdtemp(join(tmpdir(), "openext-testing-"));
  const targets = options.targets ?? {
    chrome: {},
    firefox: {}
  };
  const contentScripts = options.contentScripts ?? [
    {
      matches: ["https://example.com/*"],
      js: ["src/content.js"],
      css: ["src/content.css"]
    }
  ];
  const popupEntrypoint = options.popup === false ? "" : `popup: "src/popup.html",`;

  await writeFile(
    join(cwd, "openext.config.mjs"),
    `
      export default {
        name: "Testing Fixture",
        version: "0.1.0",
        targets: ${JSON.stringify(targets)},
        entrypoints: {
          background: "src/background.js",
          ${popupEntrypoint}
          contentScripts: ${JSON.stringify(contentScripts)}
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

test("visual test fails clearly when no browser executable is configured", async () => {
  const cwd = await createProject({ targets: { chrome: {} } });
  const previousExecutable = process.env.OPENEXTKIT_CHROME_EXECUTABLE;
  delete process.env.OPENEXTKIT_CHROME_EXECUTABLE;

  try {
    const project = await resolveOpenExtProject(cwd);
    const result = await runBrowserVisualTest(project, "chrome");

    assert.equal(result.status, "failed");
    assert.match(result.errors.join("\n"), /OPENEXTKIT_CHROME_EXECUTABLE/);
    assert.equal(result.screenshots.length, 0);
  } finally {
    if (previousExecutable) {
      process.env.OPENEXTKIT_CHROME_EXECUTABLE = previousExecutable;
    }
    await rm(cwd, { recursive: true, force: true });
  }
});

test("visual test accepts configured content scripts as visual surfaces", async () => {
  const cwd = await createProject({ targets: { chrome: {} }, popup: false });
  const previousExecutable = process.env.OPENEXTKIT_CHROME_EXECUTABLE;
  delete process.env.OPENEXTKIT_CHROME_EXECUTABLE;

  try {
    const project = await resolveOpenExtProject(cwd);
    const result = await runBrowserVisualTest(project, "chrome");

    assert.equal(result.checks.some((check) => check.name === "visual.surfaces"), false);
    assert.match(result.errors.join("\n"), /OPENEXTKIT_CHROME_EXECUTABLE/);
  } finally {
    if (previousExecutable) {
      process.env.OPENEXTKIT_CHROME_EXECUTABLE = previousExecutable;
    }
    await rm(cwd, { recursive: true, force: true });
  }
});

test("visual test reports no surfaces when no visual entrypoints or content scripts exist", async () => {
  const cwd = await createProject({ targets: { chrome: {} }, popup: false, contentScripts: [] });

  try {
    const project = await resolveOpenExtProject(cwd);
    const result = await runBrowserVisualTest(project, "chrome");

    assert.equal(result.status, "failed");
    assert.match(result.errors.join("\n"), /No visual HTML entrypoints/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("visual test warns when content script matches cannot use deterministic page", async () => {
  const cwd = await createProject({
    targets: { chrome: {} },
    popup: false,
    contentScripts: [
      {
        matches: ["file://*/*"],
        js: ["src/content.js"],
        css: []
      }
    ]
  });

  try {
    const project = await resolveOpenExtProject(cwd);
    const result = await runBrowserVisualTest(project, "chrome");

    assert.equal(result.checks.some((check) => check.name === "visual.content-script-0.match" && check.status === "warning"), true);
    assert.match(result.errors.join("\n"), /No visual HTML entrypoints/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("visual test all writes a visual report", async () => {
  const cwd = await createProject({ targets: { chrome: {} } });
  const previousExecutable = process.env.OPENEXTKIT_CHROME_EXECUTABLE;
  delete process.env.OPENEXTKIT_CHROME_EXECUTABLE;

  try {
    const project = await resolveOpenExtProject(cwd);
    const report = await runAllBrowserVisualTests(project);
    const written = JSON.parse(await readFile(join(cwd, "dist/reports/visual-test-report.json"), "utf8"));

    assert.equal(report.targets.length, 1);
    assert.equal(report.status, "failed");
    assert.equal(written.targets[0].target, "chrome");
    assert.equal(Array.isArray(written.targets[0].screenshots), true);
  } finally {
    if (previousExecutable) {
      process.env.OPENEXTKIT_CHROME_EXECUTABLE = previousExecutable;
    }
    await rm(cwd, { recursive: true, force: true });
  }
});

test("visual regression update writes baselines", async () => {
  const cwd = await createProject({ targets: { chrome: {} } });

  try {
    const project = await resolveOpenExtProject(cwd);
    const screenshotPath = join(cwd, "dist/reports/visual/chrome/popup.png");
    await mkdir(join(cwd, "dist/reports/visual/chrome"), { recursive: true });
    await writeFile(screenshotPath, Buffer.from([1, 2, 3]));
    const report = await applyVisualRegression(project, fakeVisualReport(project, screenshotPath), { update: true });
    const baseline = await readFile(join(cwd, "dist/reports/visual-baselines/chrome/popup.png"));

    assert.equal(report.status, "passed");
    assert.deepEqual([...baseline], [1, 2, 3]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("visual regression compare passes within threshold", async () => {
  const cwd = await createProject({ targets: { chrome: {} } });

  try {
    const project = await resolveOpenExtProject(cwd);
    const screenshotPath = join(cwd, "dist/reports/visual/chrome/popup.png");
    const baselinePath = join(cwd, "dist/reports/visual-baselines/chrome/popup.png");
    await mkdir(join(cwd, "dist/reports/visual/chrome"), { recursive: true });
    await mkdir(join(cwd, "dist/reports/visual-baselines/chrome"), { recursive: true });
    await writeFile(screenshotPath, Buffer.from([1, 2, 3]));
    await writeFile(baselinePath, Buffer.from([1, 2, 3]));
    const report = await applyVisualRegression(project, fakeVisualReport(project, screenshotPath), { compare: true });

    assert.equal(report.status, "passed");
    assert.equal(report.comparisons[0].differenceRatio, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("visual regression compare writes diff when threshold is exceeded", async () => {
  const cwd = await createProject({ targets: { chrome: {} } });

  try {
    const project = await resolveOpenExtProject(cwd);
    const screenshotPath = join(cwd, "dist/reports/visual/chrome/popup.png");
    const baselinePath = join(cwd, "dist/reports/visual-baselines/chrome/popup.png");
    await mkdir(join(cwd, "dist/reports/visual/chrome"), { recursive: true });
    await mkdir(join(cwd, "dist/reports/visual-baselines/chrome"), { recursive: true });
    await writeFile(screenshotPath, Buffer.from([9, 9, 9]));
    await writeFile(baselinePath, Buffer.from([1, 2, 3]));
    const report = await applyVisualRegression(project, fakeVisualReport(project, screenshotPath), { compare: true, threshold: 0 });
    const diff = await readFile(join(cwd, "dist/reports/visual-diff/chrome/popup.png"));

    assert.equal(report.status, "failed");
    assert.deepEqual([...diff], [9, 9, 9]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("dev session once reports missing browser executable clearly", async () => {
  const cwd = await createProject({ targets: { chrome: {} } });
  const previousExecutable = process.env.OPENEXTKIT_CHROME_EXECUTABLE;
  delete process.env.OPENEXTKIT_CHROME_EXECUTABLE;

  try {
    const project = await resolveOpenExtProject(cwd);

    await assert.rejects(
      () => startBrowserDevSession(project, "chrome", join(cwd, "dist/chrome"), { once: true }),
      /OPENEXTKIT_CHROME_EXECUTABLE/
    );
  } finally {
    if (previousExecutable) {
      process.env.OPENEXTKIT_CHROME_EXECUTABLE = previousExecutable;
    }
    await rm(cwd, { recursive: true, force: true });
  }
});

test("dev session once returns a launch summary without opening a browser", async () => {
  const cwd = await createProject({ targets: { chrome: {} } });
  const previousExecutable = process.env.OPENEXTKIT_CHROME_EXECUTABLE;
  process.env.OPENEXTKIT_CHROME_EXECUTABLE = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

  try {
    const project = await resolveOpenExtProject(cwd);
    const session = await startBrowserDevSession(project, "chrome", join(cwd, "dist/chrome"), { once: true });

    assert.equal(session.summary.target, "chrome");
    assert.equal(session.summary.watching, false);
    assert.equal(session.summary.reloadCount, 0);
  } finally {
    if (previousExecutable) {
      process.env.OPENEXTKIT_CHROME_EXECUTABLE = previousExecutable;
    } else {
      delete process.env.OPENEXTKIT_CHROME_EXECUTABLE;
    }
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

function fakeVisualReport(project, screenshotPath) {
  return {
    project: {
      name: project.config.name,
      rootDir: project.rootDir
    },
    generatedAt: new Date().toISOString(),
    status: "passed",
    targets: [
      {
        target: "chrome",
        status: "passed",
        checks: [],
        warnings: [],
        errors: [],
        durationMs: 0,
        screenshots: [
          {
            surface: "popup",
            url: "chrome-extension://fixture/src/popup.html",
            path: screenshotPath
          }
        ]
      }
    ]
  };
}
