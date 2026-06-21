import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
  registerTarget,
  resolveOpenExtProject,
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
  assert.deepEqual(getEnabledTargets(config), ["chrome", "firefox", "edge"]);
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
          opera: {}
        }
      }),
    (error) =>
      error instanceof OpenExtConfigError &&
      error.issues.some((issue) => issue.includes("Unrecognized key"))
  );
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

test("built-in browser targets are registered", () => {
  assert.deepEqual(listTargets().map((target) => target.name), ["chrome", "firefox", "edge", "safari"]);
  assert.equal(getTarget("chrome").supportsManifestV3, true);
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
