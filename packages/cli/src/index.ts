#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { loadOpenExtConfig, resolveOpenExtProject, type BrowserTarget } from "@openextkit/core";
import {
  createManifestReport,
  generateAllManifests,
  generateManifest,
  inspectPermissions
} from "@openextkit/manifest";
import {
  buildAllTargets,
  buildTarget as buildPackagingTarget,
  packageAllTargets,
  packageTarget as packagePackagingTarget
} from "@openextkit/packaging";
import { startOpenExtMcpServer } from "@openextkit/mcp-server";
import { runAllBrowserSmokeTests, runBrowserSmokeTest } from "@openextkit/testing";
import { isTemplateName, templateNames, writeTemplate } from "@openextkit/templates";
import { cac } from "cac";

const execFileAsync = promisify(execFile);
const validTargets = ["chrome", "firefox", "edge", "safari"] as const;

type JsonOption = {
  json?: boolean;
};

type InitOptions = {
  template?: string;
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
    .command("dev <target>", "Print development server guidance for a target")
    .action(async (target: string) => {
      const browserTarget = parseTarget(target);
      const project = await resolveOpenExtProject(process.cwd());
      assertTargetEnabled(project.enabledTargets, browserTarget);
      console.log(`Development server support for ${browserTarget} is planned.`);
      console.log("For now, run `openext build <target>` and load the generated dist folder.");
    });

  cli
    .command("build [target]", "Build extension output for one target or all targets")
    .action(async (target: string | undefined) => {
      await buildTarget(target ?? "all");
    });

  cli.command("test <target>", "Run browser extension smoke tests").action(async (target: string) => {
    await testTarget(target);
  });

  cli
    .command("doctor", "Check local OpenExtKit project setup")
    .option("--json", "Print JSON output")
    .action(async (options: JsonOption) => {
      const result = await runDoctor();
      printResult(result, options.json);
    });

  cli
    .command("inspect <kind> [target]", "Print generated manifest or permission audit")
    .option("--json", "Print JSON output")
    .action(async (kind: string, target: string | undefined, options: JsonOption) => {
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

async function runDoctor(): Promise<Record<string, unknown>> {
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

async function ensureEmptyDirectory(targetDir: string): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  const files = await readdir(targetDir);

  if (files.length > 0) {
    throw new Error(`Directory ${targetDir} is not empty.`);
  }
}

function parseTarget(target: string): BrowserTarget {
  if (validTargets.includes(target as BrowserTarget)) {
    return target as BrowserTarget;
  }

  throw new Error(`Invalid target "${target}". Expected one of: ${validTargets.join(", ")}.`);
}

function parseTargetOrAll(target: string): BrowserTarget | "all" {
  return target === "all" ? "all" : parseTarget(target);
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

runCli().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
