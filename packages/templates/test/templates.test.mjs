import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { loadOpenExtConfig, resolveOpenExtProject } from "@openextkit/core";
import { generateManifest } from "@openextkit/manifest";
import { templateNames, writeTemplate } from "../dist/index.js";

async function createTemplateProject(template) {
  const cwd = await mkdtemp(join(tmpdir(), `openext-template-${template}-`));

  await writeTemplate({
    template,
    targetDir: cwd,
    projectName: `${template}-example`
  });
  await linkCorePackage(cwd);

  return cwd;
}

async function linkCorePackage(cwd) {
  await mkdir(join(cwd, "node_modules/@openextkit"), { recursive: true });
  await symlink(resolve("../core"), join(cwd, "node_modules/@openextkit/core"), "dir").catch(
    () => undefined
  );
}

for (const template of templateNames) {
  test(`${template} template can be generated`, async () => {
    const cwd = await createTemplateProject(template);

    try {
      const config = await readFile(join(cwd, "openext.config.ts"), "utf8");
      const packageJson = await readFile(join(cwd, "package.json"), "utf8");

      assert.match(config, /defineOpenExtConfig/);
      assert.match(packageJson, new RegExp(`${template}-example`));
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test(`${template} generated config loads and creates manifest`, async () => {
    const cwd = await createTemplateProject(template);

    try {
      const config = await loadOpenExtConfig(cwd);
      const project = await resolveOpenExtProject(cwd);
      const manifest = generateManifest(project, "chrome");

      assert.equal(config.name.length > 0, true);
      assert.equal(manifest.manifest_version, 3);
      assert.equal(manifest.name, config.name);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
}
