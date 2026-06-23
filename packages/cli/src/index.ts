#!/usr/bin/env node
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { watch, type FSWatcher } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { browserTargets, getTarget, listTargets, loadOpenExtConfig, planOpenExtUpgrade, resolveOpenExtProject, suggestCompatibilityFixes, type BrowserTarget, type OpenExtProject } from "@openextkit/core";
import {
  createManifestReport,
  generateAllManifests,
  generateManifest,
  inspectPermissions,
  validateManifest
} from "@openextkit/manifest";
import {
  buildAllTargets,
  buildTarget as buildPackagingTarget,
  packageAllTargets,
  packageTarget as packagePackagingTarget
} from "@openextkit/packaging";
import { createExtensionReview, createPublishWizardReport, createReleaseReport, generateStoreMetadata, generateSubmitAssets, runPublishCheck } from "@openextkit/release";
import { startOpenExtMcpServer } from "@openextkit/mcp-server";
import {
  applyVisualRegression,
  e2eRecipeNames,
  runAllBrowserSmokeTests,
  runAllBrowserVisualTests,
  runBrowserSmokeTest,
  runBrowserVisualTest,
  runExtensionE2ETests,
  startBrowserDevSession
} from "@openextkit/testing";
import { isTemplateName, listTemplateMetadata, templateNames, writeTemplate } from "@openextkit/templates";
import { cac } from "cac";

const execFileAsync = promisify(execFile);
type JsonOption = {
  json?: boolean;
};

type DoctorOptions = JsonOption & {
  target?: string;
};

type InitOptions = {
  template?: string;
};

type DevOptions = {
  once?: boolean;
  json?: boolean;
};

type VisualOptions = {
  update?: boolean;
  compare?: boolean;
  record?: boolean;
  threshold?: string;
};

type DashboardOptions = {
  port?: string;
  host?: string;
};

type DashboardJobStatus = "queued" | "running" | "passed" | "failed";

type DashboardJob = {
  id: string;
  action: "build" | "test" | "package" | "doctor";
  target?: string;
  status: DashboardJobStatus;
  startedAt?: string;
  completedAt?: string;
  exitCode?: number;
  output: string[];
};

type InspectOptions = JsonOption & {
  advisor?: boolean;
};

type UpgradeOptions = JsonOption & {
  write?: boolean;
};

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const cli = cac("openext");

  cli
    .command("init [name]", "Create a new extension project")
    .option("--template <template>", "Starter template to use")
    .action(async (name: string | undefined, options: InitOptions) => {
      await initProject(name ?? "my-extension", options.template ?? "vanilla");
    });

  cli
    .command("dev <target>", "Build, launch, watch, and reload an unpacked extension")
    .option("--once", "Build and validate dev launch configuration without watching")
    .option("--json", "Print JSON output")
    .action(async (target: string, options: DevOptions) => {
      await devTarget(target, options);
    });

  cli
    .command("build [target]", "Build extension output for one target or all targets")
    .action(async (target: string | undefined) => {
      await buildTarget(target ?? "all");
    });

  cli
    .command("dashboard", "Serve a read-only local project dashboard")
    .option("--port <number>", "Dashboard port", { default: "4217" })
    .option("--host <host>", "Dashboard host", { default: "127.0.0.1" })
    .action(async (options: DashboardOptions) => {
      await dashboard(options);
    });

  cli.command("test <target>", "Run browser extension smoke tests").action(async (target: string) => {
    await testTarget(target);
  });

  cli
    .command("e2e <target>", "Run built-in extension E2E recipes")
    .option("--recipe <name>", "Run one built-in recipe")
    .option("--recipe-file <path>", "Run a custom JSON E2E recipe file")
    .option("--json", "Print JSON output")
    .action(async (target: string, options: JsonOption & { recipe?: string; recipeFile?: string }) => {
      const project = await resolveOpenExtProject(process.cwd());
      const recipe = options.recipe ? parseE2ERecipe(options.recipe) : undefined;
      const report = await runExtensionE2ETests(project, parseTarget(target), recipe, options.recipeFile);
      printResult(report, options.json);
    });

  cli
    .command("visual <target>", "Run visual browser extension tests and capture screenshots")
    .option("--update", "Update visual baselines from captured screenshots")
    .option("--compare", "Compare captured screenshots against visual baselines")
    .option("--record", "Pause for real-browser interaction, then save captures as baselines")
    .option("--threshold <number>", "Allowed visual difference ratio before comparison fails")
    .action(async (target: string, options: VisualOptions) => {
      await visualTarget(target, options);
    });

  cli.command("targets [action] [target]", "List or inspect registered browser targets").action((action?: string, target?: string) => {
    if (action === "inspect") {
      if (!target) {
        throw new Error("Missing target for targets inspect.");
      }

      printResult(getTarget(parseTarget(target)));
      return;
    }

    if (action) {
      throw new Error(`Invalid targets action "${action}". Expected "inspect".`);
    }

    printResult(listTargets().map((entry) => ({
      name: entry.name,
      displayName: entry.displayName,
      experimental: entry.experimental,
      packageFormat: entry.packageFormat
    })));
  });

  cli
    .command("templates", "List available project templates")
    .option("--json", "Print JSON output")
    .action((options: JsonOption) => {
      printResult({ templates: listTemplateMetadata() }, options.json);
    });

  cli
    .command("doctor", "Check local OpenExtKit project setup")
    .option("--json", "Print JSON output")
    .option("--target <target>", "Run diagnostics for one browser target")
    .action(async (options: DoctorOptions) => {
      const result = await runDoctor(options.target);
      printResult(result, options.json);
    });

  cli
    .command("upgrade", "Plan or apply safe OpenExtKit config migrations")
    .option("--write", "Apply safe migrations and create a config backup")
    .option("--json", "Print JSON output")
    .action(async (options: UpgradeOptions) => {
      const report = await planOpenExtUpgrade(process.cwd(), { write: options.write });
      printResult(report, options.json);
    });

  cli
    .command("inspect <kind> [target]", "Print generated manifest or permission audit")
    .option("--json", "Print JSON output")
    .option("--advisor", "Include permission risk advisor output")
    .action(async (kind: string, target: string | undefined, options: InspectOptions) => {
      const project = await resolveOpenExtProject(process.cwd());

      if (kind === "manifest") {
        const result =
          !target || target === "all"
            ? generateAllManifests(project)
            : generateManifest(project, parseTarget(target));

        printResult(result, options.json);
        return;
      }

      if (kind === "permissions") {
        if (options.advisor && (!target || target === "all")) {
          throw new Error("Permission advisor requires a single target.");
        }
        const result =
          !target || target === "all"
            ? createManifestReport(project).targets.map((entry) => entry.permissions)
            : inspectPermissions(project, parseTarget(target));

        printResult(result, options.json);
        return;
      }

      throw new Error(`Invalid inspect kind "${kind}". Expected "manifest" or "permissions".`);
    });

  cli
    .command("package <target>", "Create browser package archives")
    .action(async (target: string) => {
      await packageTarget(target);
    });

  cli.command("release-report", "Generate release readiness reports").action(async () => {
    const project = await resolveOpenExtProject(process.cwd());
    const report = await createReleaseReport(project);
    console.log(`Release report written to ${report.files.markdown}.`);
  });

  cli.command("store-assets", "Generate store metadata assets").action(async () => {
    const project = await resolveOpenExtProject(process.cwd());
    const result = await generateStoreMetadata(project);
    console.log(`Store metadata written to ${result.storeDir}.`);
  });

  cli
    .command("submit-assets <target>", "Generate local store submission asset folders")
    .option("--json", "Print JSON output")
    .action(async (target: string, options: JsonOption) => {
      const project = await resolveOpenExtProject(process.cwd());
      const result = await generateSubmitAssets(project, parseTargetOrAll(target));
      printResult(result, options.json);
    });

  cli.command("publish-check", "Run publish readiness checks without publishing").action(async () => {
    const project = await resolveOpenExtProject(process.cwd());
    printResult(await runPublishCheck(project));
  });

  cli
    .command("review <target>", "Create a deterministic extension review report")
    .option("--json", "Print JSON output")
    .action(async (target: string, options: JsonOption) => {
      const project = await resolveOpenExtProject(process.cwd());
      const reviewTarget = parseTargetOrAll(target);
      const report = await createExtensionReview(project, reviewTarget);
      printResult(report, options.json);
    });

  cli
    .command("publish-wizard <target>", "Create a non-interactive store readiness wizard report")
    .option("--json", "Print JSON output")
    .action(async (target: string, options: JsonOption) => {
      const project = await resolveOpenExtProject(process.cwd());
      const report = await createPublishWizardReport(project, parseTargetOrAll(target));
      printResult(report, options.json);
    });

  cli
    .command("compat <action> <target>", "Suggest compatibility fixes without mutating files")
    .option("--dry-run", "Only print suggested changes", { default: true })
    .option("--json", "Print JSON output")
    .action(async (action: string, target: string, options: JsonOption & { dryRun?: boolean }) => {
      if (action !== "fix") {
        throw new Error(`Invalid compat action "${action}". Expected "fix".`);
      }
      if (options.dryRun === false) {
        throw new Error("Compatibility fixer is suggestion-only in this release. Use --dry-run.");
      }
      const project = await resolveOpenExtProject(process.cwd());
      printResult(suggestCompatibilityFixes(project, parseTarget(target)), options.json);
    });

  cli.command("mcp", "Start the OpenExtKit MCP server over stdio").action(async () => {
    await startOpenExtMcpServer({
      cwd: process.cwd()
    });
  });

  cli.help();
  cli.version("0.0.0");
  const parsed = cli.parse(argv, { run: false });

  if (!cli.matchedCommand && !parsed.options.help && !parsed.options.version) {
    throw new Error(`Unknown command: ${parsed.args.join(" ")}`);
  }

  await cli.runMatchedCommand();
}

async function initProject(name: string, template: string): Promise<void> {
  if (!isTemplateName(template)) {
    throw new Error(`Template "${template}" is not available. Expected one of: ${templateNames.join(", ")}.`);
  }

  const targetDir = resolve(process.cwd(), name);
  await ensureEmptyDirectory(targetDir);
  await writeTemplate({
    template,
    targetDir,
    projectName: name
  });

  console.log(`Created ${name} using the ${template} template.`);
}

async function buildTarget(target: string): Promise<void> {
  const project = await resolveOpenExtProject(process.cwd());

  if (target === "all") {
    const result = await buildAllTargets(project);
    console.log(`Built targets: ${result.targets.map((entry) => entry.target).join(", ")}.`);
    return;
  }

  const browserTarget = parseTarget(target);
  const result = await buildPackagingTarget(project, browserTarget);
  console.log(`Built ${browserTarget} at ${result.outputDir}.`);
}

async function dashboard(options: DashboardOptions): Promise<void> {
  const project = await resolveOpenExtProject(process.cwd());
  const port = Number(options.port ?? 4217);
  const host = options.host ?? "127.0.0.1";
  const token = randomBytes(16).toString("hex");
  const jobs: DashboardJob[] = [];
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid dashboard port "${options.port}".`);
  }

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${host}:${port}`);
      if (url.pathname === "/" || url.pathname === "/index.html") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(await renderDashboard(project, jobs, token));
        return;
      }

      if (url.pathname === "/actions" && request.method === "POST") {
        const body = await readRequestBody(request);
        const form = new URLSearchParams(body);
        if (form.get("token") !== token) {
          response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
          response.end("Invalid dashboard action token.");
          return;
        }

        const action = form.get("action");
        if (!isDashboardAction(action)) {
          response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
          response.end("Invalid dashboard action.");
          return;
        }

        enqueueDashboardJob(project, jobs, action, form.get("target") ?? undefined);
        response.writeHead(303, { location: "/" });
        response.end();
        return;
      }

      if (url.pathname.startsWith("/reports/")) {
        const filePath = join(project.rootDir, "dist", "reports", url.pathname.slice("/reports/".length));
        response.writeHead(200, { "content-type": contentType(filePath) });
        response.end(await readFile(filePath));
        return;
      }

      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.message : String(error));
    }
  });

  await new Promise<void>((resolveListen) => {
    server.listen(port, host, resolveListen);
  });
  console.log(`OpenExtKit dashboard: http://${host}:${port}`);
  console.log(`Dashboard action token: ${token}`);
}

async function renderDashboard(project: OpenExtProject, jobs: DashboardJob[] = [], token = ""): Promise<string> {
  const publishCheck = await runPublishCheck(project);
  const reports = await readReports(project);
  const actionForms = ["build", "test", "package", "doctor"]
    .map((action) => `<form method="post" action="/actions">
          <input type="hidden" name="token" value="${escapeHtml(token)}" />
          <input type="hidden" name="action" value="${action}" />
          <label>${action}
            <select name="target">
              <option value="all">all</option>
              ${project.enabledTargets.map((target) => `<option value="${escapeHtml(target)}">${escapeHtml(target)}</option>`).join("")}
            </select>
          </label>
          <button type="submit">Run</button>
        </form>`)
    .join("");
  const jobRows = jobs
    .slice()
    .reverse()
    .map((job) => `<tr>
        <td>${escapeHtml(job.id)}</td>
        <td>${escapeHtml(job.action)}</td>
        <td>${escapeHtml(job.target ?? "all")}</td>
        <td>${escapeHtml(job.status)}</td>
        <td>${escapeHtml(job.startedAt ?? "")}</td>
        <td>${escapeHtml(job.completedAt ?? "")}</td>
        <td><pre>${escapeHtml(job.output.slice(-8).join("\n"))}</pre></td>
      </tr>`)
    .join("");
  const targetRows = project.enabledTargets
    .map((target) => {
      const manifest = generateManifest(project, target);
      const permissions = inspectPermissions(project, target);
      const readiness = publishCheck.readiness.targets.find((entry) => entry.target === target);
      const screenshots = reports.visual?.targets
        ?.find((entry: { target: BrowserTarget }) => entry.target === target)
        ?.screenshots?.map((screenshot: { surface: string; path: string }) => `<li>${escapeHtml(screenshot.surface)}: ${escapeHtml(relativeReportPath(project, screenshot.path))}</li>`)
        ?.join("") ?? "";

      return `<section class="card">
        <h2>${escapeHtml(target)}</h2>
        <p><strong>Manifest:</strong> MV${manifest.manifest_version}</p>
        <p><strong>Readiness:</strong> ${readiness ? `${readiness.percentage}% (${readiness.status})` : "not scored"}</p>
        <p><strong>Permissions:</strong> ${escapeHtml(permissions.permissions.join(", ") || "none")}</p>
        <p><strong>Host permissions:</strong> ${escapeHtml(permissions.hostPermissions.join(", ") || "none")}</p>
        <p><strong>Findings:</strong> ${permissions.findings.length}</p>
        <ul>${screenshots}</ul>
      </section>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>OpenExtKit Dashboard</title>
    <style>
      body { margin: 0; font: 14px system-ui, sans-serif; color: #1f2328; background: #f6f8fa; }
      header { padding: 24px; background: #fff; border-bottom: 1px solid #d0d7de; }
      main { padding: 24px; display: grid; gap: 16px; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
      .card { background: #fff; border: 1px solid #d0d7de; border-radius: 8px; padding: 16px; }
      form { display: inline-flex; gap: 8px; align-items: center; margin: 0 8px 8px 0; }
      button, select { font: inherit; }
      table { width: 100%; border-collapse: collapse; }
      td, th { border-top: 1px solid #d0d7de; padding: 8px; text-align: left; vertical-align: top; }
      pre { white-space: pre-wrap; margin: 0; max-height: 140px; overflow: auto; }
      h1, h2 { margin: 0 0 8px; }
      a { color: #0969da; }
    </style>
  </head>
  <body>
    <header>
      <h1>${escapeHtml(project.config.name)}</h1>
      <p>${escapeHtml(project.config.description ?? "No description")} · ${escapeHtml(project.config.version)}</p>
    </header>
    <main>
      <section class="card">
        <h2>Project Status</h2>
        <p><strong>Overall readiness:</strong> ${publishCheck.readiness.percentage}% (${publishCheck.status})</p>
        <p><strong>Enabled targets:</strong> ${project.enabledTargets.map(escapeHtml).join(", ")}</p>
        <p><strong>Reports:</strong> ${Object.keys(reports).join(", ") || "none"}</p>
        <p><strong>Submit assets:</strong> ${reports.submit ? "generated" : "not generated"}</p>
      </section>
      <section class="card">
        <h2>Actions</h2>
        ${actionForms}
      </section>
      <section class="card">
        <h2>Jobs</h2>
        <table>
          <thead><tr><th>ID</th><th>Action</th><th>Target</th><th>Status</th><th>Started</th><th>Completed</th><th>Output</th></tr></thead>
          <tbody>${jobRows || "<tr><td colspan=\"7\">No jobs yet.</td></tr>"}</tbody>
        </table>
      </section>
      <section class="grid">${targetRows}</section>
    </main>
  </body>
</html>`;
}

export function enqueueDashboardJob(project: OpenExtProject, jobs: DashboardJob[], action: DashboardJob["action"], target?: string): DashboardJob {
  const job: DashboardJob = {
    id: String(jobs.length + 1),
    action,
    target: target || "all",
    status: "queued",
    output: []
  };
  jobs.push(job);
  void runDashboardJob(project, job);
  return job;
}

async function runDashboardJob(project: OpenExtProject, job: DashboardJob): Promise<void> {
  job.status = "running";
  job.startedAt = new Date().toISOString();
  try {
    if (job.action === "build") {
      job.target === "all" ? await buildAllTargets(project) : await buildPackagingTarget(project, parseTarget(job.target ?? "all"));
    } else if (job.action === "package") {
      job.target === "all" ? await packageAllTargets(project) : await packagePackagingTarget(project, parseTarget(job.target ?? "all"));
    } else if (job.action === "test") {
      job.target === "all" ? await runAllBrowserSmokeTests(project) : await runBrowserSmokeTest(project, parseTarget(job.target ?? "all"));
    } else {
      await runDoctor(job.target === "all" ? undefined : job.target);
    }
    job.output.push(`${job.action} ${job.target ?? "all"} completed.`);
    job.status = "passed";
    job.exitCode = 0;
  } catch (error) {
    job.output.push(error instanceof Error ? error.message : String(error));
    job.status = "failed";
    job.exitCode = 1;
  } finally {
    job.completedAt = new Date().toISOString();
  }
}

export function isDashboardAction(action: string | null): action is DashboardJob["action"] {
  return action === "build" || action === "test" || action === "package" || action === "doctor";
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readReports(project: OpenExtProject): Promise<Record<string, any>> {
  return {
    manifest: await readJsonIfExists(join(project.rootDir, "dist", "reports", "manifest-report.json")),
    permissions: await readJsonIfExists(join(project.rootDir, "dist", "reports", "permissions-report.json")),
    tests: await readJsonIfExists(join(project.rootDir, "dist", "reports", "test-report.json")),
    visual: await readJsonIfExists(join(project.rootDir, "dist", "reports", "visual-test-report.json")),
    regression: await readJsonIfExists(join(project.rootDir, "dist", "reports", "visual-regression-report.json")),
    release: await readJsonIfExists(join(project.rootDir, "dist", "reports", "release-report.json")),
    submit: await readJsonIfExists(join(project.rootDir, "dist", "submit", "submission-config.json"))
  };
}

async function readJsonIfExists(path: string): Promise<any | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
}

function relativeReportPath(project: OpenExtProject, path: string): string {
  const relativePath = relative(join(project.rootDir, "dist", "reports"), path);
  return relativePath.startsWith("..") ? path : `/reports/${relativePath}`;
}

function contentType(path: string): string {
  if (path.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }

  if (path.endsWith(".png")) {
    return "image/png";
  }

  if (path.endsWith(".md")) {
    return "text/markdown; charset=utf-8";
  }

  return "application/octet-stream";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function devTarget(target: string, options: DevOptions): Promise<void> {
  const project = await resolveOpenExtProject(process.cwd());
  const browserTarget = parseTarget(target);
  assertTargetEnabled(project.enabledTargets, browserTarget);

  const capabilities = getTarget(browserTarget);
  if (!capabilities.supportsExtensionLoadingInTests) {
    throw new Error(`${capabilities.displayName} does not support automated extension loading in the current dev runner.`);
  }

  const build = await buildPackagingTarget(project, browserTarget);
  const session = await startBrowserDevSession(project, browserTarget, build.outputDir, { once: options.once });

  printResult(session.summary, options.json);
  if (options.once) {
    return;
  }
  console.log("Watching src, public, and openext.config files. Press Ctrl+C to stop.");

  let rebuilding = false;
  const rebuild = async (): Promise<void> => {
    if (rebuilding) {
      return;
    }

    rebuilding = true;
    try {
      await buildPackagingTarget(project, browserTarget);
      const summary = await session.reload();
      console.log(`Reloaded ${browserTarget} extension (${summary.reloadCount}).`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
    } finally {
      rebuilding = false;
    }
  };

  const watchers = await createDevWatchers(project, rebuild);
  const shutdown = async (): Promise<void> => {
    for (const watcher of watchers) {
      watcher.close();
    }
    await session.close();
  };

  process.once("SIGINT", () => {
    shutdown().finally(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    shutdown().finally(() => process.exit(0));
  });
}

async function packageTarget(target: string): Promise<void> {
  const project = await resolveOpenExtProject(process.cwd());

  if (target === "all") {
    const result = await packageAllTargets(project);
    console.log(`Packaged targets: ${result.targets.map((entry) => entry.target).join(", ")}.`);
    return;
  }

  const browserTarget = parseTarget(target);
  const result = await packagePackagingTarget(project, browserTarget);

  if (result.packagePath) {
    console.log(`Packaged ${browserTarget} at ${result.packagePath}.`);
    return;
  }

  console.log(`Built ${browserTarget}; Safari package archives require Xcode-specific steps.`);
}

async function createDevWatchers(project: OpenExtProject, onChange: () => Promise<void>): Promise<FSWatcher[]> {
  const watchers: FSWatcher[] = [];
  const candidates = ["src", "public", project.configPath];

  for (const candidate of candidates) {
    const path = resolve(project.rootDir, candidate);
    const info = await stat(path).catch(() => undefined);
    if (!info) {
      continue;
    }

    watchers.push(watch(path, { recursive: info.isDirectory() }, () => {
      void onChange();
    }));
  }

  return watchers;
}

async function testTarget(target: string): Promise<void> {
  const project = await resolveOpenExtProject(process.cwd());

  if (target === "all") {
    const report = await runAllBrowserSmokeTests(project);
    console.log(`Smoke-tested targets: ${report.targets.map((entry) => `${entry.target}:${entry.status}`).join(", ")}.`);
    return;
  }

  const browserTarget = parseTarget(target);
  const result = await runBrowserSmokeTest(project, browserTarget);
  console.log(`Smoke-tested ${browserTarget}: ${result.status}.`);
}

async function visualTarget(target: string, options: VisualOptions = {}): Promise<void> {
  const project = await resolveOpenExtProject(process.cwd());
  const visualOptions = {
    update: options.update,
    compare: options.compare,
    record: options.record,
    threshold: options.threshold ? Number(options.threshold) : undefined
  };

  if (target === "all") {
    const report = await runAllBrowserVisualTests(project, visualOptions);
    console.log(`Visual-tested targets: ${report.targets.map((entry) => `${entry.target}:${entry.status}`).join(", ")}.`);
    return;
  }

  const browserTarget = parseTarget(target);
  const result = await runBrowserVisualTest(project, browserTarget, visualOptions);
  const regression = await applyVisualRegression(project, {
    project: {
      name: project.config.name,
      rootDir: project.rootDir
    },
    generatedAt: new Date().toISOString(),
    status: result.status,
    targets: [result]
  }, visualOptions);
  console.log(`Visual-tested ${browserTarget}: ${result.status}.`);
  if (regression) {
    console.log(`Visual regression ${regression.mode}: ${regression.status}.`);
  }
}

async function runDoctor(target?: string): Promise<Record<string, unknown>> {
  const browserTarget = target ? parseTarget(target) : undefined;
  const checks: Array<Record<string, unknown>> = [
    {
      name: "node",
      ok: true,
      detail: process.version
    }
  ];

  checks.push(await commandCheck("pnpm", ["--version"]));

  try {
    const config = await loadOpenExtConfig(process.cwd());
    checks.push({
      name: "config",
      ok: true,
      detail: "OpenExtKit config found"
    });
    checks.push({
      name: "targets",
      ok: true,
      detail: Object.keys(config.targets).join(", ")
    });

    if (browserTarget) {
      const project = await resolveOpenExtProject(process.cwd());
      checks.push(...(await runTargetDiagnostics(project, browserTarget)));
    }
  } catch (error) {
    checks.push({
      name: "config",
      ok: false,
      detail: error instanceof Error ? error.message : String(error)
    });
  }

  if (process.platform === "darwin") {
    checks.push({
      name: "safari",
      ok: true,
      detail: "Safari packaging may require Xcode in later phases"
    });
  }

  return {
    ok: checks.every((check) => check.ok),
    checks
  };
}

async function runTargetDiagnostics(project: OpenExtProject, target: BrowserTarget): Promise<Array<Record<string, unknown>>> {
  const checks: Array<Record<string, unknown>> = [];
  const capabilities = getTarget(target);
  const enabled = project.enabledTargets.includes(target);
  const packageName = `${slugify(project.config.name)}-${target}.zip`;

  checks.push({
    name: "target.enabled",
    target,
    ok: enabled,
    detail: enabled ? `${target} is enabled` : `${target} is not enabled`
  });

  if (!enabled) {
    return checks;
  }

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
    name: "browser.executable",
    target,
    ok: !capabilities.supportsExtensionLoadingInTests || Boolean(process.env[getExecutableEnvName(target)]),
    detail: capabilities.supportsExtensionLoadingInTests ? `Set ${getExecutableEnvName(target)} for browser automation` : "Browser automation is not supported for this target"
  });
  checks.push({
    name: "package.exists",
    target,
    ok: await fileExists(join(project.rootDir, "dist", "packages", packageName)),
    detail: `Expected dist/packages/${packageName}`
  });
  checks.push({
    name: "report.manifest",
    target,
    ok: await fileExists(join(project.rootDir, "dist", "reports", "manifest-report.json")),
    detail: "Expected dist/reports/manifest-report.json"
  });
  checks.push({
    name: "report.tests",
    target,
    ok: await fileExists(join(project.rootDir, "dist", "reports", "test-report.json")),
    detail: "Expected dist/reports/test-report.json"
  });
  checks.push({
    name: "store.metadata",
    target,
    ok: await directoryExists(join(project.rootDir, "dist", "store", target)),
    detail: `Expected dist/store/${target}`
  });
  checks.push({
    name: "visual.screenshots",
    target,
    ok: await directoryExists(join(project.rootDir, "dist", "reports", "visual", target)),
    detail: `Expected dist/reports/visual/${target}`
  });

  return checks;
}

async function commandCheck(command: string, args: string[]): Promise<Record<string, unknown>> {
  try {
    const result = await execFileAsync(command, args);

    return {
      name: command,
      ok: true,
      detail: result.stdout.trim()
    };
  } catch {
    return {
      name: command,
      ok: false,
      detail: `${command} was not found on PATH`
    };
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

function getExecutableEnvName(target: BrowserTarget): string {
  if (target === "edge") {
    return "OPENEXTKIT_EDGE_EXECUTABLE";
  }

  if (target === "chrome") {
    return "OPENEXTKIT_CHROME_EXECUTABLE";
  }

  return `OPENEXTKIT_${target.toUpperCase()}_EXECUTABLE`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function ensureEmptyDirectory(targetDir: string): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  const files = await readdir(targetDir);

  if (files.length > 0) {
    throw new Error(`Directory ${targetDir} is not empty.`);
  }
}

function parseTarget(target: string): BrowserTarget {
  if (browserTargets.includes(target as BrowserTarget)) {
    return target as BrowserTarget;
  }

  throw new Error(`Invalid target "${target}". Expected one of: ${browserTargets.join(", ")}.`);
}

function parseTargetOrAll(target: string): BrowserTarget | "all" {
  return target === "all" ? "all" : parseTarget(target);
}

function parseE2ERecipe(recipe: string): (typeof e2eRecipeNames)[number] {
  if (e2eRecipeNames.includes(recipe as (typeof e2eRecipeNames)[number])) {
    return recipe as (typeof e2eRecipeNames)[number];
  }

  throw new Error(`Invalid E2E recipe "${recipe}". Expected one of: ${e2eRecipeNames.join(", ")}.`);
}

function assertTargetEnabled(enabledTargets: BrowserTarget[], target: BrowserTarget): void {
  if (!enabledTargets.includes(target)) {
    throw new Error(`Target "${target}" is not enabled in openext.config.`);
  }
}

function printResult(result: unknown, json = false): void {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (typeof result === "string") {
    console.log(result);
    return;
  }

  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
