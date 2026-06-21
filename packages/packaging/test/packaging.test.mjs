import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveOpenExtProject } from "@openextkit/core";
import {
  buildAllTargets,
  buildTarget,
  packageAllTargets,
  packageTarget,
  OpenExtPackagingError
} from "../dist/index.js";

async function createProject(overrides = "") {
  const cwd = await mkdtemp(join(tmpdir(), "openext-packaging-"));

  await mkdir(join(cwd, "src/popup"), { recursive: true });
  await mkdir(join(cwd, "public"), { recursive: true });
  await writeFile(join(cwd, "src/background.ts"), "console.log('background');\n");
  await writeFile(join(cwd, "src/content.ts"), "console.log('content');\n");
  await writeFile(join(cwd, "src/content.css"), "body { color: red; }\n");
  await writeFile(join(cwd, "src/popup/index.html"), "<script src=\"./main.ts\"></script>\n");
  await writeFile(join(cwd, "src/popup/main.ts"), "console.log('popup');\n");
  await writeFile(join(cwd, "public/icon.txt"), "icon\n");
  await writeFile(
    join(cwd, "openext.config.mjs"),
    `
      export default {
        name: "Packaging Test",
        version: "0.1.0",
        targets: {
          chrome: {},
          firefox: {},
          edge: {},
          safari: {}
        },
        permissions: {
          required: ["storage", "tabs"],
          host: ["https://example.com/*"]
        },
        entrypoints: {
          background: "src/background.ts",
          popup: "src/popup/index.html",
          contentScripts: [
            {
              matches: ["https://example.com/*"],
              js: ["src/content.ts"],
              css: ["src/content.css"]
            }
          ]
        },
        ${overrides}
      };
    `
  );

  return cwd;
}

test("buildTarget writes manifest, source files, public files, and reports", async () => {
  const cwd = await createProject();

  try {
    const project = await resolveOpenExtProject(cwd);
    const result = await buildTarget(project, "chrome");
    const manifest = JSON.parse(await readFile(join(cwd, "dist/chrome/manifest.json"), "utf8"));
    const manifestReport = JSON.parse(
      await readFile(join(cwd, "dist/reports/manifest-report.json"), "utf8")
    );

    assert.equal(result.target, "chrome");
    assert.equal(manifest.name, "Packaging Test");
    assert.match(await readFile(join(cwd, "dist/chrome/src/popup/main.ts"), "utf8"), /popup/);
    assert.match(await readFile(join(cwd, "dist/chrome/public/icon.txt"), "utf8"), /icon/);
    assert.equal(manifestReport.targets.some((entry) => entry.target === "chrome"), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("buildAllTargets writes Safari instructions and compatibility report", async () => {
  const cwd = await createProject();

  try {
    const project = await resolveOpenExtProject(cwd);
    const result = await buildAllTargets(project);
    const safariReadme = await readFile(join(cwd, "dist/safari/README-SAFARI.md"), "utf8");
    const compatibility = JSON.parse(
      await readFile(join(cwd, "dist/reports/compatibility-report.json"), "utf8")
    );

    assert.deepEqual(
      result.targets.map((entry) => entry.target),
      ["chrome", "firefox", "edge", "safari"]
    );
    assert.match(safariReadme, /Safari output/i);
    assert.equal(
      compatibility.targets.some((entry) => entry.target === "safari" && entry.experimental),
      true
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("packageTarget creates a ZIP archive for Chrome", async () => {
  const cwd = await createProject();

  try {
    const project = await resolveOpenExtProject(cwd);
    const result = await packageTarget(project, "chrome");
    const zip = await readFile(result.packagePath);

    assert.match(result.packagePath, /packaging-test-chrome\.zip$/);
    assert.equal(zip.subarray(0, 2).toString("utf8"), "PK");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("packageAllTargets creates browser archives and leaves Safari as folder output", async () => {
  const cwd = await createProject();

  try {
    const project = await resolveOpenExtProject(cwd);
    const result = await packageAllTargets(project);

    assert.equal(result.targets.filter((entry) => entry.packagePath).length, 3);
    assert.equal(result.targets.find((entry) => entry.target === "safari")?.packagePath, undefined);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("buildTarget fails clearly for missing configured files", async () => {
  const cwd = await createProject();

  try {
    await writeFile(
      join(cwd, "openext.config.mjs"),
      `
        export default {
          name: "Broken",
          version: "0.1.0",
          targets: { chrome: {} },
          entrypoints: { background: "src/missing.ts" }
        };
      `
    );

    const project = await resolveOpenExtProject(cwd);

    await assert.rejects(() => buildTarget(project, "chrome"), OpenExtPackagingError);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
