import assert from "node:assert/strict";
import test from "node:test";
import { validateOpenExtConfig } from "@openextkit/core";
import {
  createManifestReport,
  generateAllManifests,
  generateManifest,
  inspectPermissions,
  validateManifest
} from "../dist/index.js";

function createProject(overrides = {}) {
  const config = validateOpenExtConfig({
    name: "Manifest Test",
    version: "0.1.0",
    description: "A test extension",
    targets: {
      chrome: {},
      firefox: {},
      edge: {},
      safari: {}
    },
    permissions: {
      required: ["storage", "tabs", "scripting"],
      optional: ["alarms"],
      host: ["<all_urls>", "https://example.com/*"]
    },
    entrypoints: {
      background: "src/background.ts",
      popup: "src/popup/index.html",
      options: "src/options/index.html",
      contentScripts: [
        {
          matches: ["https://example.com/*"],
          js: ["src/content.ts"],
          css: ["src/content.css"]
        }
      ]
    },
    ...overrides
  });

  return {
    rootDir: process.cwd(),
    configPath: `${process.cwd()}/openext.config.ts`,
    config,
    enabledTargets: Object.keys(config.targets),
    warnings: []
  };
}

test("generates Chrome manifest", () => {
  const manifest = generateManifest(createProject(), "chrome");

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "Manifest Test");
  assert.deepEqual(manifest.permissions, ["scripting", "storage", "tabs"]);
  assert.deepEqual(manifest.host_permissions, ["<all_urls>", "https://example.com/*"]);
  assert.equal(manifest.background?.service_worker, "src/background.ts");
  assert.equal(manifest.action?.default_popup, "src/popup/index.html");
});

test("generates Firefox manifest with gecko settings", () => {
  const manifest = generateManifest(createProject(), "firefox");

  assert.deepEqual(manifest.browser_specific_settings, { gecko: {} });
  assert.equal(validateManifest(manifest, "firefox").valid, true);
});

test("manifest generator uses target capabilities", () => {
  const manifest = generateManifest(createProject(), "firefox");
  const chrome = generateManifest(createProject(), "chrome");

  assert.equal(Boolean(manifest.browser_specific_settings?.gecko), true);
  assert.equal(chrome.browser_specific_settings, undefined);
});

test("generates Edge manifest like Chrome", () => {
  const manifest = generateManifest(createProject(), "edge");

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.action?.default_popup, "src/popup/index.html");
});

test("reports Safari experimental warning", () => {
  const project = createProject();
  const report = createManifestReport(project);
  const safari = report.targets.find((entry) => entry.target === "safari");

  assert.match(safari?.warnings.join("\n") ?? "", /Safari manifest output is experimental/);
});

test("generates content script manifest entries", () => {
  const manifest = generateManifest(createProject(), "chrome");

  assert.deepEqual(manifest.content_scripts, [
    {
      matches: ["https://example.com/*"],
      js: ["src/content.ts"],
      css: ["src/content.css"]
    }
  ]);
});

test("generates background service worker", () => {
  const manifest = generateManifest(createProject(), "chrome");

  assert.deepEqual(manifest.background, {
    service_worker: "src/background.ts",
    type: "module"
  });
});

test("creates permission report warnings", () => {
  const report = inspectPermissions(createProject(), "chrome");

  assert.equal(report.findings.some((finding) => finding.code === "permission.tabs"), true);
  assert.equal(report.findings.some((finding) => finding.code === "permission.scripting"), true);
});

test("warns for broad host permissions", () => {
  const report = inspectPermissions(createProject(), "chrome");

  assert.equal(report.findings.some((finding) => finding.code === "host.broad"), true);
});

test("detects invalid host patterns", () => {
  const project = createProject({
    permissions: {
      host: ["not-a-host-pattern"]
    }
  });
  const manifest = generateManifest(project, "chrome");
  const validation = validateManifest(manifest, "chrome");
  const permissions = inspectPermissions(project, "chrome");

  assert.equal(validation.valid, false);
  assert.equal(permissions.findings.some((finding) => finding.code === "host.invalid"), true);
});

test("generated manifests are JSON serializable", () => {
  const manifests = generateAllManifests(createProject());

  assert.doesNotThrow(() => JSON.stringify(manifests));
});
