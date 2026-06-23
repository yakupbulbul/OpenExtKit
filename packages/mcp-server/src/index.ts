import { appendFile, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  browserTargets,
  getTarget,
  listTargets,
  loadOpenExtConfig,
  resolveOpenExtProject,
  validateOpenExtConfig,
  type BrowserTarget,
  type OpenExtProject
} from "@openextkit/core";
import {
  createManifestReport,
  generateManifest,
  inspectPermissions,
  validateManifest
} from "@openextkit/manifest";
import {
  buildAllTargets,
  buildTarget,
  packageAllTargets,
  packageTarget
} from "@openextkit/packaging";
import {
  createExtensionReview,
  createReleaseReport as createReleaseReportArtifact,
  generateStoreMetadata,
  runPublishCheck
} from "@openextkit/release";
import { listTemplateMetadata, templateNames, writeTemplate } from "@openextkit/templates";
import {
  applyVisualRegression,
  e2eRecipeNames,
  runAllBrowserSmokeTests,
  runAllBrowserVisualTests,
  runBrowserSmokeTest,
  runBrowserVisualTest,
  runExtensionE2ETests
} from "@openextkit/testing";
import { z } from "zod";

export const mcpServerPackageName = "@openextkit/mcp-server";
export const mcpToolNames = [
  "get_project_info",
  "validate_config",
  "run_diagnostics",
  "generate_manifest",
  "inspect_permissions",
  "check_browser_compatibility",
  "build_target",
  "build_all_targets",
  "package_target",
  "package_all_targets",
  "run_browser_tests",
  "run_all_browser_tests",
  "run_visual_tests",
  "run_all_visual_tests",
  "run_e2e_tests",
  "create_extension_project",
  "list_templates",
  "list_browser_targets",
  "inspect_browser_target",
  "suggest_target_changes",
  "generate_store_metadata",
  "run_publish_check",
  "review_extension",
  "visual_review",
  "explain_last_error",
  "create_release_report"
] as const;

export type McpToolName = (typeof mcpToolNames)[number];
export type McpToolStatus = "ok" | "error";

export type OpenExtMcpContext = {
  cwd: string;
  lastError?: string;
};

export type OpenExtMcpToolResult = {
  tool: McpToolName;
  status: McpToolStatus;
  data?: unknown;
  error?: string;
  filesChanged: string[];
};

type McpToolDefinition = {
  name: McpToolName;
  description: string;
  inputSchema: z.ZodRawShape;
  handler: (input: Record<string, unknown>, context: OpenExtMcpContext) => Promise<OpenExtMcpToolResult>;
};

const targetSchema = z.enum(browserTargets);
const projectPathSchema = z.string().min(1).default(".");
const visualOptionsSchema = {
  update: z.boolean().default(false),
  compare: z.boolean().default(false),
  record: z.boolean().default(false),
  threshold: z.number().min(0).max(1).optional()
};
const e2eRecipeSchema = z.enum(e2eRecipeNames as [string, ...string[]]).optional();

export function createOpenExtMcpServer(context: Partial<OpenExtMcpContext> = {}): McpServer {
  const server = new McpServer({
    name: "openextkit",
    version: "0.0.0"
  });
  const serverContext: OpenExtMcpContext = {
    cwd: resolve(context.cwd ?? process.cwd()),
    lastError: context.lastError
  };

  for (const tool of createOpenExtMcpTools()) {
    server.registerTool(
      tool.name,
      {
        title: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      },
      async (input) => toCallToolResult(await tool.handler(input as Record<string, unknown>, serverContext))
    );
  }

  return server;
}

export function createOpenExtMcpTools(): McpToolDefinition[] {
  return [
    {
      name: "get_project_info",
      description: "Return OpenExtKit project metadata for the current workspace.",
      inputSchema: { projectPath: projectPathSchema },
      handler: wrapTool("get_project_info", async (input, context) => {
        const project = await resolveProject(context, readProjectPath(input));
        return {
          name: project.config.name,
          version: project.config.version,
          rootDir: project.rootDir,
          configPath: project.configPath,
          enabledTargets: project.enabledTargets,
          warnings: project.warnings
        };
      })
    },
    {
      name: "validate_config",
      description: "Load and validate openext.config from the workspace.",
      inputSchema: { projectPath: projectPathSchema },
      handler: wrapTool("validate_config", async (input, context) => {
        const projectRoot = resolveWorkspacePath(context.cwd, readProjectPath(input));
        const config = await loadOpenExtConfig(projectRoot);
        return {
          valid: true,
          config: validateOpenExtConfig(config)
        };
      })
    },
    {
      name: "run_diagnostics",
      description: "Run target-aware project diagnostics for config, manifest, permissions, artifacts, and automation setup.",
      inputSchema: { projectPath: projectPathSchema, target: targetSchema.optional() },
      handler: wrapTool("run_diagnostics", async (input, context) => {
        const project = await resolveProject(context, readProjectPath(input));
        const target = typeof input.target === "string" ? readTarget(input) : undefined;
        return runDiagnostics(project, target);
      })
    },
    {
      name: "generate_manifest",
      description: "Generate a target-specific extension manifest.",
      inputSchema: { projectPath: projectPathSchema, target: targetSchema },
      handler: wrapTool("generate_manifest", async (input, context) => {
        const project = await resolveProject(context, readProjectPath(input));
        return generateManifest(project, readTarget(input));
      })
    },
    {
      name: "inspect_permissions",
      description: "Inspect target permissions and host permission risk.",
      inputSchema: { projectPath: projectPathSchema, target: targetSchema },
      handler: wrapTool("inspect_permissions", async (input, context) => {
        const project = await resolveProject(context, readProjectPath(input));
        return inspectPermissions(project, readTarget(input));
      })
    },
    {
      name: "check_browser_compatibility",
      description: "Create a manifest, permission, and compatibility report summary.",
      inputSchema: { projectPath: projectPathSchema },
      handler: wrapTool("check_browser_compatibility", async (input, context) => {
        const project = await resolveProject(context, readProjectPath(input));
        return createManifestReport(project);
      })
    },
    {
      name: "build_target",
      description: "Build one enabled browser target inside the current project.",
      inputSchema: { projectPath: projectPathSchema, target: targetSchema },
      handler: wrapTool("build_target", async (input, context) => {
        const project = await resolveProject(context, readProjectPath(input));
        assertAllowedProject(project, context);
        return buildTarget(project, readTarget(input));
      }, ["dist"])
    },
    {
      name: "build_all_targets",
      description: "Build all enabled browser targets inside the current project.",
      inputSchema: { projectPath: projectPathSchema },
      handler: wrapTool("build_all_targets", async (input, context) => {
        const project = await resolveProject(context, readProjectPath(input));
        assertAllowedProject(project, context);
        return buildAllTargets(project);
      }, ["dist"])
    },
    {
      name: "package_target",
      description: "Package one enabled browser target inside the current project.",
      inputSchema: { projectPath: projectPathSchema, target: targetSchema },
      handler: wrapTool("package_target", async (input, context) => {
        const project = await resolveProject(context, readProjectPath(input));
        assertAllowedProject(project, context);
        return packageTarget(project, readTarget(input));
      }, ["dist"])
    },
    {
      name: "package_all_targets",
      description: "Package all enabled browser targets inside the current project.",
      inputSchema: { projectPath: projectPathSchema },
      handler: wrapTool("package_all_targets", async (input, context) => {
        const project = await resolveProject(context, readProjectPath(input));
        assertAllowedProject(project, context);
        return packageAllTargets(project);
      }, ["dist"])
    },
    {
      name: "run_browser_tests",
      description: "Run smoke tests for one browser target using isolated profiles.",
      inputSchema: { projectPath: projectPathSchema, target: targetSchema },
      handler: wrapTool("run_browser_tests", async (input, context) => {
        const project = await resolveProject(context, readProjectPath(input));
        assertAllowedProject(project, context);
        return runBrowserSmokeTest(project, readTarget(input));
      })
    },
    {
      name: "run_all_browser_tests",
      description: "Run smoke tests for all enabled browser targets using isolated profiles.",
      inputSchema: { projectPath: projectPathSchema },
      handler: wrapTool("run_all_browser_tests", async (input, context) => {
        const project = await resolveProject(context, readProjectPath(input));
        assertAllowedProject(project, context);
        return runAllBrowserSmokeTests(project);
      }, ["dist/reports/test-report.json"])
    },
    {
      name: "run_visual_tests",
      description: "Run visual tests for one browser target and capture screenshots for extension HTML surfaces.",
      inputSchema: { projectPath: projectPathSchema, target: targetSchema, ...visualOptionsSchema },
      handler: wrapTool("run_visual_tests", async (input, context) => {
        const project = await resolveProject(context, readProjectPath(input));
        assertAllowedProject(project, context);
        const options = readVisualOptions(input);
        const result = await runBrowserVisualTest(project, readTarget(input), options);
        const regression = await applyVisualRegression(project, {
          project: {
            name: project.config.name,
            rootDir: project.rootDir
          },
          generatedAt: new Date().toISOString(),
          status: result.status,
          targets: [result]
        }, options);
        return { ...result, regression };
      }, ["dist/reports/visual", "dist/reports/visual-test-report.json"])
    },
    {
      name: "run_all_visual_tests",
      description: "Run visual tests for all enabled browser targets and capture screenshots for extension HTML surfaces.",
      inputSchema: { projectPath: projectPathSchema, ...visualOptionsSchema },
      handler: wrapTool("run_all_visual_tests", async (input, context) => {
        const project = await resolveProject(context, readProjectPath(input));
        assertAllowedProject(project, context);
        return runAllBrowserVisualTests(project, readVisualOptions(input));
      }, ["dist/reports/visual", "dist/reports/visual-test-report.json"])
    },
    {
      name: "run_e2e_tests",
      description: "Run built-in or JSON-file deterministic extension E2E recipes for one browser target.",
      inputSchema: { projectPath: projectPathSchema, target: targetSchema, recipe: e2eRecipeSchema, recipeFile: z.string().optional() },
      handler: wrapTool("run_e2e_tests", async (input, context) => {
        const project = await resolveProject(context, readProjectPath(input));
        assertAllowedProject(project, context);
        const recipe = typeof input.recipe === "string" ? input.recipe as (typeof e2eRecipeNames)[number] : undefined;
        return runExtensionE2ETests(project, readTarget(input), recipe, typeof input.recipeFile === "string" ? input.recipeFile : undefined);
      }, ["dist/reports/e2e-report.json"])
    },
    {
      name: "create_extension_project",
      description: "Create a new extension project from an OpenExtKit template.",
      inputSchema: {
        name: z.string().min(1),
        template: z.enum(templateNames).default("vanilla"),
        projectPath: projectPathSchema,
        dangerousAllowNonEmptyDirectory: z.boolean().default(false)
      },
      handler: wrapTool("create_extension_project", async (input, context) => {
        const name = readRequiredString(input, "name");
        const projectPath = readProjectPath(input);
        const targetDir = resolveWorkspacePath(context.cwd, join(projectPath, name));

        if (!Boolean(input.dangerousAllowNonEmptyDirectory)) {
          await assertEmptyOrMissingDirectory(targetDir);
        }

        const template = readTemplate(input);
        await writeTemplate({ template, targetDir, projectName: name });
        return { targetDir, template };
      }, ["openext.config.ts", "package.json"])
    },
    {
      name: "list_templates",
      description: "List available OpenExtKit project templates.",
      inputSchema: {},
      handler: wrapTool("list_templates", async () => ({ templates: listTemplateMetadata() }))
    },
    {
      name: "list_browser_targets",
      description: "List registered browser targets and their primary capabilities.",
      inputSchema: {},
      handler: wrapTool("list_browser_targets", async () => ({ targets: listTargets() }))
    },
    {
      name: "inspect_browser_target",
      description: "Inspect one browser target capability record.",
      inputSchema: { target: targetSchema },
      handler: wrapTool("inspect_browser_target", async (input) => getTarget(readTarget(input)))
    },
    {
      name: "suggest_target_changes",
      description: "Suggest target capability changes for a project based on configured targets.",
      inputSchema: { projectPath: projectPathSchema },
      handler: wrapTool("suggest_target_changes", async (input, context) => {
        const project = await resolveProject(context, readProjectPath(input));
        return {
          suggestions: project.enabledTargets.flatMap((target) => {
            const capabilities = getTarget(target);
            const suggestions: string[] = [];

            if (capabilities.experimental) {
              suggestions.push(`${capabilities.displayName} is experimental; keep package and test fallbacks explicit.`);
            }

            if (!capabilities.supportsExtensionLoadingInTests) {
              suggestions.push(`${capabilities.displayName} does not support automated extension loading in the current runner.`);
            }

            return suggestions;
          })
        };
      })
    },
    {
      name: "generate_store_metadata",
      description: "Generate store listing metadata files for enabled targets without publishing.",
      inputSchema: { projectPath: projectPathSchema },
      handler: wrapTool("generate_store_metadata", async (input, context) => {
        const project = await resolveProject(context, readProjectPath(input));
        assertAllowedProject(project, context);
        return generateStoreMetadata(project);
      }, ["dist/store"])
    },
    {
      name: "run_publish_check",
      description: "Run publish readiness checks without publishing to browser stores.",
      inputSchema: { projectPath: projectPathSchema },
      handler: wrapTool("run_publish_check", async (input, context) => {
        const project = await resolveProject(context, readProjectPath(input));
        assertAllowedProject(project, context);
        return runPublishCheck(project);
      })
    },
    {
      name: "review_extension",
      description: "Create a deterministic agent-friendly extension review report.",
      inputSchema: { projectPath: projectPathSchema, target: z.union([targetSchema, z.literal("all")]).default("all") },
      handler: wrapTool("review_extension", async (input, context) => {
        const project = await resolveProject(context, readProjectPath(input));
        const target = input.target === "all" || typeof input.target !== "string" ? "all" : readTarget(input);
        return createExtensionReview(project, target);
      }, ["dist/reports/review-report.json"])
    },
    {
      name: "visual_review",
      description: "Return screenshots, visual diffs, readiness, permission risks, and next fixes for agent UI review.",
      inputSchema: { projectPath: projectPathSchema, target: z.union([targetSchema, z.literal("all")]).default("all") },
      handler: wrapTool("visual_review", async (input, context) => {
        const project = await resolveProject(context, readProjectPath(input));
        const target = input.target === "all" || typeof input.target !== "string" ? "all" : readTarget(input);
        const review = await createExtensionReview(project, target);
        const publishCheck = await runPublishCheck(project);
        const visual = await readJson(join(project.rootDir, "dist", "reports", "visual-test-report.json"));
        const regression = await readJson(join(project.rootDir, "dist", "reports", "visual-regression-report.json"));
        return {
          review,
          readiness: publishCheck.readiness,
          visual,
          regression,
          permissionRisks: review.targets.flatMap((entry) => entry.risks.filter((risk) => /permission|host|privacy/.test(risk))),
          recommendedNextFixes: review.recommendedNextFixes
        };
      }, ["dist/reports/review-report.json"])
    },
    {
      name: "explain_last_error",
      description: "Return the last MCP tool error observed by this server process.",
      inputSchema: {},
      handler: wrapTool("explain_last_error", async (_input, context) => ({
        lastError: context.lastError ?? null,
        guidance: context.lastError
          ? "Review the referenced path and rerun the specific OpenExtKit tool after fixing the issue."
          : "No previous MCP tool error has been recorded."
      }))
    },
    {
      name: "create_release_report",
      description: "Write a local release report summarizing manifests, permissions, packages, and tests.",
      inputSchema: { projectPath: projectPathSchema },
      handler: wrapTool("create_release_report", async (input, context) => {
        const project = await resolveProject(context, readProjectPath(input));
        assertAllowedProject(project, context);
        return createReleaseReportArtifact(project);
      }, ["dist/reports/release-report.json", "dist/reports/release-report.md", "dist/store"])
    }
  ];
}

export async function runOpenExtMcpTool(
  name: McpToolName,
  input: Record<string, unknown> = {},
  context: Partial<OpenExtMcpContext> = {}
): Promise<OpenExtMcpToolResult> {
  const tool = createOpenExtMcpTools().find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`Unknown OpenExtKit MCP tool: ${name}`);
  }

  return tool.handler(input, {
    cwd: resolve(context.cwd ?? process.cwd()),
    lastError: context.lastError
  });
}

export async function startOpenExtMcpServer(context: Partial<OpenExtMcpContext> = {}): Promise<void> {
  const server = createOpenExtMcpServer(context);
  await server.connect(new StdioServerTransport());
}

function wrapTool(
  tool: McpToolName,
  execute: (input: Record<string, unknown>, context: OpenExtMcpContext) => Promise<unknown>,
  filesChanged: string[] = []
): McpToolDefinition["handler"] {
  return async (input, context) => {
    const inputSummary = summarizeInput(input);

    try {
      const data = await execute(input, context);
      const result: OpenExtMcpToolResult = { tool, status: "ok", data, filesChanged };
      await writeAuditLog(context.cwd, tool, inputSummary, "ok", filesChanged);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      context.lastError = message;
      const result: OpenExtMcpToolResult = { tool, status: "error", error: message, filesChanged: [] };
      await writeAuditLog(context.cwd, tool, inputSummary, "error", []);
      return result;
    }
  };
}

function toCallToolResult(result: OpenExtMcpToolResult): CallToolResult {
  return {
    isError: result.status === "error",
    content: [{ type: "text", text: JSON.stringify(redactSecrets(result), null, 2) }]
  };
}

async function resolveProject(context: OpenExtMcpContext, projectPath: string): Promise<OpenExtProject> {
  return resolveOpenExtProject(resolveWorkspacePath(context.cwd, projectPath));
}

function assertAllowedProject(project: OpenExtProject, context: OpenExtMcpContext): void {
  resolveWorkspacePath(context.cwd, relative(context.cwd, project.rootDir));
}

function resolveWorkspacePath(workspaceRoot: string, requestedPath: string): string {
  const root = resolve(workspaceRoot);
  const candidate = resolve(root, requestedPath);
  const relativePath = relative(root, candidate);

  if (relativePath !== "" && (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath))) {
    throw new Error(`Path "${requestedPath}" is outside the MCP workspace root.`);
  }

  return candidate;
}

function readProjectPath(input: Record<string, unknown>): string {
  return typeof input.projectPath === "string" ? input.projectPath : ".";
}

function readTarget(input: Record<string, unknown>): BrowserTarget {
  const target = input.target;

  if (typeof target === "string" && browserTargets.includes(target as BrowserTarget)) {
    return target as BrowserTarget;
  }

  throw new Error(`Invalid or missing target. Expected one of: ${browserTargets.join(", ")}.`);
}

function readTemplate(input: Record<string, unknown>): (typeof templateNames)[number] {
  const template = input.template ?? "vanilla";

  if (typeof template === "string" && templateNames.includes(template as (typeof templateNames)[number])) {
    return template as (typeof templateNames)[number];
  }

  throw new Error(`Invalid template. Expected one of: ${templateNames.join(", ")}.`);
}

function readVisualOptions(input: Record<string, unknown>): { update?: boolean; compare?: boolean; record?: boolean; threshold?: number } {
  return {
    update: Boolean(input.update),
    compare: Boolean(input.compare),
    record: Boolean(input.record),
    threshold: typeof input.threshold === "number" ? input.threshold : undefined
  };
}

async function runDiagnostics(project: OpenExtProject, target?: BrowserTarget): Promise<Record<string, unknown>> {
  const checks: Array<Record<string, unknown>> = [
    {
      name: "config",
      ok: true,
      detail: "OpenExtKit config found"
    },
    {
      name: "targets",
      ok: true,
      detail: project.enabledTargets.join(", ")
    }
  ];

  if (!target) {
    return {
      ok: checks.every((check) => check.ok),
      checks
    };
  }

  const enabled = project.enabledTargets.includes(target);
  checks.push({
    name: "target.enabled",
    target,
    ok: enabled,
    detail: enabled ? `${target} is enabled` : `${target} is not enabled`
  });

  if (enabled) {
    const manifest = generateManifest(project, target);
    const manifestValidation = validateManifest(manifest, target);
    const permissions = inspectPermissions(project, target);
    checks.push({
      name: "manifest.valid",
      target,
      ok: manifestValidation.valid,
      detail: manifestValidation.valid ? "Manifest validates" : manifestValidation.errors.join("; ")
    });
    checks.push({
      name: "permissions.valid",
      target,
      ok: permissions.findings.every((finding) => finding.level !== "error"),
      detail: permissions.findings.length === 0 ? "No permission findings" : permissions.findings.map((finding) => finding.message).join("; ")
    });
    checks.push({
      name: "package.exists",
      target,
      ok: await fileExists(join(project.rootDir, "dist", "packages", `${slugify(project.config.name)}-${target}.zip`)),
      detail: `Expected dist/packages/${slugify(project.config.name)}-${target}.zip`
    });
    checks.push({
      name: "visual.screenshots",
      target,
      ok: await directoryExists(join(project.rootDir, "dist", "reports", "visual", target)),
      detail: `Expected dist/reports/visual/${target}`
    });
  }

  return {
    ok: checks.every((check) => check.ok),
    checks
  };
}

function readRequiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];

  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  throw new Error(`Missing required string argument "${key}".`);
}

async function assertEmptyOrMissingDirectory(targetDir: string): Promise<void> {
  try {
    const entries = await readdir(targetDir);
    if (entries.length > 0) {
      throw new Error(`Directory ${targetDir} already exists and is not empty.`);
    }
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") {
      return;
    }

    throw error;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function writeAuditLog(
  workspaceRoot: string,
  tool: McpToolName,
  inputSummary: Record<string, unknown>,
  status: McpToolStatus,
  filesChanged: string[]
): Promise<void> {
  const auditPath = join(workspaceRoot, ".openextkit", "audit.log");
  await mkdir(dirname(auditPath), { recursive: true });
  await appendFile(
    auditPath,
    `${JSON.stringify({ timestamp: new Date().toISOString(), tool, inputSummary, status, filesChanged })}\n`
  );
}

function summarizeInput(input: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(redactSecrets(input))) {
    summary[key] = typeof value === "string" && value.length > 120 ? `${value.slice(0, 117)}...` : value;
  }

  return summary;
}

function redactSecrets<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (key, currentValue) =>
      /secret|token|password|cookie|authorization/i.test(key) ? "[redacted]" : currentValue
    )
  ) as T;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startOpenExtMcpServer().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
