import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  defineOpenExtConfig,
  getConfigWarnings,
  getEnabledTargets,
  getTarget,
  listTargets,
  loadOpenExtConfig,
  OpenExtConfigError,
  planOpenExtUpgrade,
  registerTarget,
  resolveOpenExtProject,
  suggestCompatibilityFixes,
  validateOpenExtConfig
} from "../dist/index.js";

const validConfig = {
  name: "My Extension",
  version: "0.1.0",
  framework: "vanilla",
  targets: {
    chrome: {},
    firefox: { manifest: 3 },
    edge: { manifest: 3 }
  },
  permissions: {
    required: ["tabs", "storage", "tabs"],
    optional: ["scripting"],
    host: ["https://example.com/*"]
  },
  entrypoints: {
    background: "src/../src/background.ts",
    popup: "src/popup/index.html",
    contentScripts: [
      {
        matches: ["<all_urls>"],
        js: ["src/content.ts"]
      }
    ]
  }
};

test("defineOpenExtConfig returns the config object", () => {
  assert.equal(defineOpenExtConfig(validConfig), validConfig);
});

test("valid config passes and normalizes values", () => {
  const config = validateOpenExtConfig(validConfig);

  assert.equal(config.name, "My Extension");
  assert.equal(config.version, "0.1.0");
  assert.deepEqual(config.permissions.required, ["storage", "tabs"]);
  assert.equal(config.entrypoints.background, "src/background.ts");
  assert.deepEqual(config.submission, {});
  assert.deepEqual(getEnabledTargets(config), ["chrome", "firefox", "edge"]);
});

test("submission config validates and normalizes target metadata", () => {
  const config = validateOpenExtConfig({
    ...validConfig,
    submission: {
      chrome: {
        listingId: "chrome-listing",
        privacyPolicyUrl: "https://example.com/privacy"
      },
      firefox: {
        addonId: "firefox-addon",
        supportUrl: "https://example.com/support"
      },
      edge: {
        productId: "edge-product",
        homepageUrl: "https://example.com"
      }
    }
  });

  assert.equal(config.submission.chrome?.listingId, "chrome-listing");
  assert.equal(config.submission.firefox?.addonId, "firefox-addon");
  assert.equal(config.submission.edge?.productId, "edge-product");
});

test("suggestCompatibilityFixes reports broad hosts without mutating", () => {
  const config = validateOpenExtConfig(validConfig);
  const project = {
    rootDir: "/tmp/openext",
    configPath: "/tmp/openext/openext.config.ts",
    config,
    enabledTargets: getEnabledTargets(config),
    warnings: []
  };
  const report = suggestCompatibilityFixes(project, "firefox");

  assert.equal(report.dryRun, true);
  assert.equal(report.suggestions.some((entry) => entry.code === "host.broad"), true);
});

test("missing name fails with a useful error", () => {
  assert.throws(
    () => validateOpenExtConfig({ ...validConfig, name: undefined }),
    (error) =>
      error instanceof OpenExtConfigError &&
      error.issues.some((issue) => issue.includes("name"))
  );
});

test("missing version fails with a useful error", () => {
  assert.throws(
    () => validateOpenExtConfig({ ...validConfig, version: undefined }),
    (error) =>
      error instanceof OpenExtConfigError &&
      error.issues.some((issue) => issue.includes("version"))
  );
});

test("invalid target fails", () => {
  assert.throws(
    () =>
      validateOpenExtConfig({
        ...validConfig,
        targets: {
          chrome: {},
          brave: {}
        }
      }),
    (error) =>
      error instanceof OpenExtConfigError &&
      error.issues.some((issue) => issue.includes("Unrecognized key"))
  );
});

test("Opera target is valid and Chromium-compatible", () => {
  const config = validateOpenExtConfig({
    ...validConfig,
    targets: {
      opera: {}
    }
  });

  assert.equal(config.targets.opera?.manifest, 3);
  assert.equal(getTarget("opera").supportsDeclarativeNetRequest, true);
  assert.equal(getTarget("opera").supportsExtensionLoadingInTests, true);
});

test("manifest defaults to 3", () => {
  const config = validateOpenExtConfig({
    ...validConfig,
    targets: {
      chrome: {}
    }
  });

  assert.equal(config.targets.chrome?.manifest, 3);
});

test("Safari is normalized as experimental and emits a warning", () => {
  const config = validateOpenExtConfig({
    ...validConfig,
    targets: {
      safari: { manifest: 3, experimental: false }
    }
  });

  assert.equal(config.targets.safari?.experimental, true);
  assert.match(getConfigWarnings(config).join("\n"), /Safari support is experimental/);
});

test("permissions normalize missing and duplicate values", () => {
  const config = validateOpenExtConfig({
    name: "Permissions",
    version: "1.0.0",
    targets: {
      chrome: {}
    },
    permissions: {
      required: ["storage", "storage"],
      host: ["https://example.com/*", "https://example.com/*"]
    }
  });

  assert.deepEqual(config.permissions, {
    required: ["storage"],
    optional: [],
    host: ["https://example.com/*"]
  });
});

test("entrypoints normalize optional and nested paths", () => {
  const config = validateOpenExtConfig({
    name: "Entrypoints",
    version: "1.0.0",
    targets: {
      chrome: {}
    },
    entrypoints: {
      popup: "src/popup/../popup/index.html",
      contentScripts: [
        {
          matches: ["https://example.com/*"],
          js: ["src/./content.ts"],
          css: ["src/styles/../content.css"]
        }
      ]
    }
  });

  assert.equal(config.entrypoints.popup, "src/popup/index.html");
  assert.equal(config.entrypoints.contentScripts[0].js[0], "src/content.ts");
  assert.equal(config.entrypoints.contentScripts[0].css[0], "src/content.css");
});

test("loadOpenExtConfig loads TypeScript config files", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "openext-core-"));

  try {
    await writeFile(
      join(cwd, "openext.config.ts"),
      `
        import { defineOpenExtConfig } from "${resolve("dist/index.js")}";

        export default defineOpenExtConfig({
          name: "Loaded",
          version: "1.2.3",
          targets: {
            chrome: {}
          }
        });
      `
    );

    const config = await loadOpenExtConfig(cwd);

    assert.equal(config.name, "Loaded");
    assert.equal(config.targets.chrome?.manifest, 3);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("resolveOpenExtProject returns project metadata", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "openext-project-"));

  try {
    await writeFile(
      join(cwd, "openext.config.mjs"),
      `
        export default {
          name: "Project",
          version: "0.0.1",
          targets: {
            chrome: {},
            safari: {}
          }
        };
      `
    );

    const project = await resolveOpenExtProject(cwd);

    assert.equal(project.config.name, "Project");
    assert.deepEqual(project.enabledTargets, ["chrome", "safari"]);
    assert.match(project.warnings.join("\n"), /Safari support is experimental/);
    assert.match(project.configPath, /openext\.config\.mjs$/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("planOpenExtUpgrade reports migrations without mutating by default", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "openext-upgrade-"));
  const configPath = join(cwd, "openext.config.mjs");

  try {
    await writeFile(configPath, "export default { name: 'Old', version: '0.1.0', targets: { chrome: {} }, entrypoints: {} };\n");
    const before = await readFile(configPath, "utf8");
    const report = await planOpenExtUpgrade(cwd);
    const after = await readFile(configPath, "utf8");

    assert.equal(report.dryRun, true);
    assert.equal(report.migrations.some((migration) => migration.status === "pending"), true);
    assert.equal(after, before);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("planOpenExtUpgrade writes safe migrations with a backup and is idempotent", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "openext-upgrade-write-"));
  const configPath = join(cwd, "openext.config.mjs");

  try {
    await writeFile(configPath, "export default { name: 'Old', version: '0.1.0', targets: { chrome: {} }, entrypoints: {} };\n");
    const report = await planOpenExtUpgrade(cwd, { write: true });
    const upgraded = await readFile(configPath, "utf8");
    const second = await planOpenExtUpgrade(cwd);

    assert.equal(report.dryRun, false);
    assert.equal(existsSync(`${configPath}.bak`), true);
    assert.match(upgraded, /manifest: 3/);
    assert.match(upgraded, /submission: \{\}/);
    assert.equal(second.migrations.every((migration) => migration.status === "skipped"), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("built-in browser targets are registered", () => {
  assert.deepEqual(listTargets().map((target) => target.name), ["chrome", "firefox", "edge", "opera", "safari"]);
  assert.equal(getTarget("chrome").supportsManifestV3, true);
  assert.equal(getTarget("opera").packageFormat, "zip");
  assert.equal(getTarget("safari").experimental, true);
});

test("custom browser target can be registered", () => {
  const target = registerTarget({
    ...getTarget("chrome"),
    name: "brave",
    displayName: "Brave"
  });

  assert.equal(target.name, "brave");
  assert.equal(getTarget("brave").displayName, "Brave");
});
