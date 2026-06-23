import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveOpenExtProject } from "@openextkit/core";
import { createExtensionReview, createPublishWizardReport, createReleaseReport, generateStoreMetadata, runPublishCheck } from "../dist/index.js";

async function createProject() {
  const cwd = await mkdtemp(join(tmpdir(), "openext-release-"));
  await writeFile(join(cwd, "README.md"), "# Release fixture\n");
  await writeFile(join(cwd, "LICENSE"), "MIT\n");
  await writeFile(
    join(cwd, "openext.config.mjs"),
    `
      export default {
        name: "Release Fixture",
        version: "0.1.0",
        description: "Release fixture description.",
        targets: { chrome: {}, firefox: {}, edge: {} },
        permissions: {
          required: ["storage"],
          host: ["<all_urls>"]
        },
        entrypoints: {
          background: "src/background.js"
        }
      };
    `
  );
  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(join(cwd, "src/background.js"), "console.log('release');\n");
  return cwd;
}

test("generateStoreMetadata writes store assets", async () => {
  const cwd = await createProject();

  try {
    const project = await resolveOpenExtProject(cwd);
    const result = await generateStoreMetadata(project);
    const description = await readFile(join(cwd, "dist/store/chrome/full-description.md"), "utf8");
    const checklist = await readFile(join(cwd, "dist/store/chrome/screenshot-checklist.md"), "utf8");

    assert.equal(result.files.length, 18);
    assert.match(description, /Release fixture description/);
    assert.match(checklist, /Visual baseline/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("runPublishCheck reports missing packages and permission warnings", async () => {
  const cwd = await createProject();

  try {
    const project = await resolveOpenExtProject(cwd);
    const result = await runPublishCheck(project);

    assert.equal(result.status, "failed");
    assert.equal(result.readiness.targets.length, 3);
    assert.equal(result.readiness.percentage < 100, true);
    assert.equal(result.checks.some((check) => check.name === "package.exists" && check.status === "failed"), true);
    assert.equal(result.checks.some((check) => check.name === "privacy.warning"), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("createReleaseReport writes markdown and json reports", async () => {
  const cwd = await createProject();

  try {
    const project = await resolveOpenExtProject(cwd);
    const report = await createReleaseReport(project);
    const markdown = await readFile(join(cwd, "dist/reports/release-report.md"), "utf8");
    const json = JSON.parse(await readFile(join(cwd, "dist/reports/release-report.json"), "utf8"));

    assert.match(markdown, /Release Report/);
    assert.match(markdown, /Store Readiness/);
    assert.equal(json.project.name, "Release Fixture");
    assert.equal(typeof json.publishCheck.readiness.percentage, "number");
    assert.equal(report.files.markdown.endsWith("release-report.md"), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("store readiness score improves with generated artifacts", async () => {
  const cwd = await createProject();

  try {
    await mkdir(join(cwd, "dist/packages"), { recursive: true });
    await mkdir(join(cwd, "dist/reports/visual/chrome"), { recursive: true });
    await writeFile(join(cwd, "PRIVACY.md"), "# Privacy\n");
    await writeFile(join(cwd, "dist/packages/release-fixture-chrome.zip"), "zip\n");
    await writeFile(join(cwd, "dist/reports/test-report.json"), "{}\n");
    await writeFile(join(cwd, "dist/reports/visual-test-report.json"), "{}\n");

    const project = await resolveOpenExtProject(cwd);
    await generateStoreMetadata(project);
    const result = await runPublishCheck(project);
    const chrome = result.readiness.targets.find((target) => target.target === "chrome");

    assert.equal(chrome.score > 0, true);
    assert.equal(chrome.categories.some((category) => category.category === "package" && category.status === "passed"), true);
    assert.equal(chrome.categories.some((category) => category.category === "visual" && category.status === "passed"), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("createExtensionReview writes deterministic review report", async () => {
  const cwd = await createProject();

  try {
    const project = await resolveOpenExtProject(cwd);
    const report = await createExtensionReview(project, "chrome");
    const json = JSON.parse(await readFile(join(cwd, "dist/reports/review-report.json"), "utf8"));

    assert.equal(report.targets.length, 1);
    assert.equal(report.targets[0].target, "chrome");
    assert.equal(Array.isArray(report.topRisks), true);
    assert.equal(json.project.name, "Release Fixture");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("createPublishWizardReport writes ordered readiness items", async () => {
  const cwd = await createProject();

  try {
    const project = await resolveOpenExtProject(cwd);
    const report = await createPublishWizardReport(project, "chrome");
    const json = JSON.parse(await readFile(join(cwd, "dist/reports/publish-wizard-report.json"), "utf8"));

    assert.equal(report.items.some((item) => item.target === "chrome" && item.action.length > 0), true);
    assert.equal(json.project.name, "Release Fixture");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
