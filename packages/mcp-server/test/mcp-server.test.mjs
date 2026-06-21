import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createOpenExtMcpServer,
  createOpenExtMcpTools,
  mcpToolNames,
  runOpenExtMcpTool
} from "../dist/index.js";

async function createProject() {
  const cwd = await mkdtemp(join(tmpdir(), "openext-mcp-"));
  await writeFile(
    join(cwd, "openext.config.mjs"),
    `
      export default {
        name: "MCP Fixture",
        version: "0.1.0",
        targets: {
          chrome: {},
          firefox: {}
        },
        permissions: {
          required: ["storage"],
          host: ["https://example.com/*"]
        },
        entrypoints: {
          background: "src/background.js"
        }
      };
    `
  );
  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(join(cwd, "src/background.js"), "console.log('background');\n");
  return cwd;
}

test("server starts as an MCP server instance", () => {
  const server = createOpenExtMcpServer({ cwd: process.cwd() });

  assert.equal(typeof server.connect, "function");
  assert.equal(typeof server.close, "function");
});

test("tools are registered", () => {
  const tools = createOpenExtMcpTools();

  assert.deepEqual(tools.map((tool) => tool.name), [...mcpToolNames]);
});

test("get_project_info works", async () => {
  const cwd = await createProject();

  try {
    const result = await runOpenExtMcpTool("get_project_info", {}, { cwd });

    assert.equal(result.status, "ok");
    assert.equal(result.data.name, "MCP Fixture");
    assert.deepEqual(result.data.enabledTargets, ["chrome", "firefox"]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("validate_config works", async () => {
  const cwd = await createProject();

  try {
    const result = await runOpenExtMcpTool("validate_config", {}, { cwd });

    assert.equal(result.status, "ok");
    assert.equal(result.data.valid, true);
    assert.equal(result.data.config.name, "MCP Fixture");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("generate_manifest works", async () => {
  const cwd = await createProject();

  try {
    const result = await runOpenExtMcpTool("generate_manifest", { target: "chrome" }, { cwd });

    assert.equal(result.status, "ok");
    assert.equal(result.data.manifest_version, 3);
    assert.equal(result.data.background.service_worker, "src/background.js");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("inspect_permissions works", async () => {
  const cwd = await createProject();

  try {
    const result = await runOpenExtMcpTool("inspect_permissions", { target: "chrome" }, { cwd });

    assert.equal(result.status, "ok");
    assert.deepEqual(result.data.permissions, ["storage"]);
    assert.equal(Array.isArray(result.data.findings), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("build_all_targets works", async () => {
  const cwd = await createProject();

  try {
    const result = await runOpenExtMcpTool("build_all_targets", {}, { cwd });
    const manifest = JSON.parse(await readFile(join(cwd, "dist/chrome/manifest.json"), "utf8"));

    assert.equal(result.status, "ok");
    assert.deepEqual(result.data.targets.map((target) => target.target), ["chrome", "firefox"]);
    assert.equal(manifest.name, "MCP Fixture");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("package_all_targets works", async () => {
  const cwd = await createProject();

  try {
    const result = await runOpenExtMcpTool("package_all_targets", {}, { cwd });
    const archive = await readFile(join(cwd, "dist/packages/mcp-fixture-chrome.zip"));

    assert.equal(result.status, "ok");
    assert.deepEqual(result.data.targets.map((target) => target.target), ["chrome", "firefox"]);
    assert.equal(archive.subarray(0, 2).toString("utf8"), "PK");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("run_all_browser_tests works", async () => {
  const cwd = await createProject();

  try {
    await runOpenExtMcpTool("build_all_targets", {}, { cwd });
    const result = await runOpenExtMcpTool("run_all_browser_tests", {}, { cwd });

    assert.equal(result.status, "ok");
    assert.deepEqual(result.data.targets.map((target) => target.target), ["chrome", "firefox"]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("audit log is written", async () => {
  const cwd = await createProject();

  try {
    await runOpenExtMcpTool("list_templates", {}, { cwd });
    const audit = await readFile(join(cwd, ".openextkit/audit.log"), "utf8");
    const entry = JSON.parse(audit.trim().split("\n").at(-1));

    assert.equal(entry.tool, "list_templates");
    assert.equal(entry.status, "ok");
    assert.ok(entry.timestamp);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("tool rejects paths outside workspace", async () => {
  const cwd = await createProject();

  try {
    const result = await runOpenExtMcpTool("get_project_info", { projectPath: ".." }, { cwd });

    assert.equal(result.status, "error");
    assert.match(result.error, /outside the MCP workspace root/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
