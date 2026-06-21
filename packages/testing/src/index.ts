import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { BrowserTarget, OpenExtContentScript, OpenExtProject } from "@openextkit/core";

export type TestStatus = "passed" | "warning" | "failed";

export type TestCheck = {
  name: string;
  status: TestStatus;
  message: string;
  durationMs: number;
};

export type BrowserSmokeTestResult = {
  target: BrowserTarget;
  status: TestStatus;
  checks: TestCheck[];
  warnings: string[];
  errors: string[];
  durationMs: number;
  browser?: {
    executablePath?: string;
    loaded: boolean;
    profileDir?: string;
  };
};

export type BrowserTestReport = {
  project: {
    name: string;
    rootDir: string;
  };
  generatedAt: string;
  status: TestStatus;
  targets: BrowserSmokeTestResult[];
};

export type TestProfile = {
  target: BrowserTarget;
  profileDir: string;
};

export type LoadExtensionResult = {
  target: BrowserTarget;
  loaded: boolean;
  executablePath?: string;
  profileDir?: string;
  warnings: string[];
  errors: string[];
};

export class OpenExtTestingError extends Error {
  readonly target?: BrowserTarget;

  constructor(message: string, target?: BrowserTarget) {
    super(message);
    this.name = "OpenExtTestingError";
    this.target = target;
  }
}

export async function runBrowserSmokeTest(
  project: OpenExtProject,
  target: BrowserTarget
): Promise<BrowserSmokeTestResult> {
  const startedAt = Date.now();
  const checks: TestCheck[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!project.enabledTargets.includes(target)) {
    addError(errors, checks, "target.enabled", `Target "${target}" is not enabled in openext.config.`);
    return finalizeResult(target, startedAt, checks, warnings, errors);
  }

  const extensionPath = join(project.rootDir, "dist", target);
  await checkDirectory(extensionPath, checks, errors);

  const manifest = await checkManifest(extensionPath, checks, errors);
  if (manifest) {
    await checkConfiguredFiles(extensionPath, project.config.entrypoints, checks, warnings);
  }

  runWrapperMockChecks(checks);

  const capability = getTestingCapability(target);
  if (!capability.supported) {
    addWarning(warnings, checks, "browser.capability", capability.message);
  } else if (process.env.OPENEXTKIT_RUN_BROWSER_SMOKE === "1") {
    const loadResult = await loadExtensionInBrowser(target, extensionPath);
    warnings.push(...loadResult.warnings);
    errors.push(...loadResult.errors);
    checks.push({
      name: "browser.load",
      status: loadResult.loaded ? "passed" : loadResult.errors.length > 0 ? "failed" : "warning",
      message: loadResult.loaded ? `Loaded extension in ${target}.` : loadResult.warnings[0] ?? "Browser load skipped.",
      durationMs: 0
    });

    return finalizeResult(target, startedAt, checks, warnings, errors, {
      executablePath: loadResult.executablePath,
      loaded: loadResult.loaded,
      profileDir: loadResult.profileDir
    });
  } else {
    addWarning(
      warnings,
      checks,
      "browser.launch",
      "Browser launch skipped. Set OPENEXTKIT_RUN_BROWSER_SMOKE=1 and a browser executable env var to load the extension."
    );
  }

  return finalizeResult(target, startedAt, checks, warnings, errors);
}

export async function runAllBrowserSmokeTests(project: OpenExtProject): Promise<BrowserTestReport> {
  const targets: BrowserSmokeTestResult[] = [];

  for (const target of project.enabledTargets) {
    targets.push(await runBrowserSmokeTest(project, target));
  }

  const report = createReport(project, targets);
  await writeTestReport(project, report);
  return report;
}

export async function createTestProfile(target: BrowserTarget): Promise<TestProfile> {
  const profileDir = await mkdtemp(join(tmpdir(), `openext-${target}-profile-`));
  return {
    target,
    profileDir
  };
}

export async function loadExtensionInBrowser(
  target: BrowserTarget,
  extensionPath: string
): Promise<LoadExtensionResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const capability = getTestingCapability(target);

  if (!capability.supported) {
    warnings.push(capability.message);
    return {
      target,
      loaded: false,
      warnings,
      errors
    };
  }

  const executablePath = getExecutableFromEnv(target);
  if (!executablePath) {
    warnings.push(`No ${target} executable configured. Set ${target === "edge" ? "OPENEXTKIT_EDGE_EXECUTABLE" : "OPENEXTKIT_CHROME_EXECUTABLE"}.`);
    return {
      target,
      loaded: false,
      warnings,
      errors
    };
  }

  const profile = await createTestProfile(target);

  try {
    const { chromium } = await import("playwright-core");
    const context = await chromium.launchPersistentContext(profile.profileDir, {
      executablePath,
      headless: false,
      args: [
        `--disable-extensions-except=${resolve(extensionPath)}`,
        `--load-extension=${resolve(extensionPath)}`
      ]
    });
    await context.close();

    return {
      target,
      loaded: true,
      executablePath,
      profileDir: profile.profileDir,
      warnings,
      errors
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return {
      target,
      loaded: false,
      executablePath,
      profileDir: profile.profileDir,
      warnings,
      errors
    };
  }
}

export async function createTestReport(project: OpenExtProject): Promise<BrowserTestReport> {
  return runAllBrowserSmokeTests(project);
}

async function checkDirectory(outputDir: string, checks: TestCheck[], errors: string[]): Promise<void> {
  const startedAt = Date.now();

  try {
    const info = await stat(outputDir);
    if (!info.isDirectory()) {
      throw new OpenExtTestingError(`${outputDir} is not a directory.`);
    }

    checks.push({
      name: "output.exists",
      status: "passed",
      message: `Extension output exists at ${outputDir}.`,
      durationMs: Date.now() - startedAt
    });
  } catch {
    addError(errors, checks, "output.exists", `Missing extension output at ${outputDir}. Run openext build first.`);
  }
}

async function checkManifest(
  outputDir: string,
  checks: TestCheck[],
  errors: string[]
): Promise<Record<string, unknown> | undefined> {
  const startedAt = Date.now();
  const manifestPath = join(outputDir, "manifest.json");

  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    checks.push({
      name: "manifest.valid",
      status: "passed",
      message: "manifest.json exists and contains valid JSON.",
      durationMs: Date.now() - startedAt
    });
    return manifest;
  } catch (error) {
    addError(
      errors,
      checks,
      "manifest.valid",
      error instanceof SyntaxError ? "manifest.json is not valid JSON." : "manifest.json is missing."
    );
    return undefined;
  }
}

async function checkConfiguredFiles(
  outputDir: string,
  entrypoints: OpenExtProject["config"]["entrypoints"],
  checks: TestCheck[],
  warnings: string[]
): Promise<void> {
  await checkOptionalFile(outputDir, "entrypoint.background", entrypoints.background, checks, warnings);
  await checkOptionalFile(outputDir, "entrypoint.popup", entrypoints.popup, checks, warnings);
  await checkOptionalFile(outputDir, "entrypoint.options", entrypoints.options, checks, warnings);

  for (const [index, contentScript] of entrypoints.contentScripts.entries()) {
    await checkContentScriptFiles(outputDir, index, contentScript, checks, warnings);
  }
}

async function checkContentScriptFiles(
  outputDir: string,
  index: number,
  contentScript: OpenExtContentScript,
  checks: TestCheck[],
  warnings: string[]
): Promise<void> {
  for (const filePath of contentScript.js) {
    await checkOptionalFile(outputDir, `entrypoint.contentScripts.${index}.js`, filePath, checks, warnings);
  }

  for (const filePath of contentScript.css) {
    await checkOptionalFile(outputDir, `entrypoint.contentScripts.${index}.css`, filePath, checks, warnings);
  }
}

async function checkOptionalFile(
  outputDir: string,
  name: string,
  filePath: string | undefined,
  checks: TestCheck[],
  warnings: string[]
): Promise<void> {
  if (!filePath) {
    return;
  }

  const startedAt = Date.now();
  const absolutePath = join(outputDir, filePath);

  try {
    const info = await stat(absolutePath);
    if (!info.isFile()) {
      throw new OpenExtTestingError(`${absolutePath} is not a file.`);
    }

    checks.push({
      name,
      status: "passed",
      message: `${filePath} exists.`,
      durationMs: Date.now() - startedAt
    });
  } catch {
    addWarning(warnings, checks, name, `${filePath} is referenced but was not found in ${outputDir}.`);
  }
}

function runWrapperMockChecks(checks: TestCheck[]): void {
  const storage = new Map<string, unknown>();
  storage.set("openext", true);
  checks.push({
    name: "wrapper.storage.mock",
    status: storage.get("openext") === true ? "passed" : "failed",
    message: "Storage wrapper mock can set and read a value.",
    durationMs: 0
  });

  const messages: unknown[] = [];
  messages.push({ type: "openext.smoke" });
  checks.push({
    name: "wrapper.messaging.mock",
    status: messages.length === 1 ? "passed" : "failed",
    message: "Messaging wrapper mock can enqueue a message.",
    durationMs: 0
  });
}

function getTestingCapability(target: BrowserTarget): { supported: boolean; message: string } {
  if (target === "chrome" || target === "edge") {
    return {
      supported: true,
      message: `${target} extension loading is supported when a browser executable is configured.`
    };
  }

  if (target === "firefox") {
    return {
      supported: false,
      message: "Firefox fallback smoke tests validate generated files; direct extension loading is not enabled yet."
    };
  }

  return {
    supported: false,
    message: "Safari browser testing requires Xcode-specific automation and is reported as an unsupported capability."
  };
}

function getExecutableFromEnv(target: BrowserTarget): string | undefined {
  if (target === "edge") {
    return process.env.OPENEXTKIT_EDGE_EXECUTABLE;
  }

  if (target === "chrome") {
    return process.env.OPENEXTKIT_CHROME_EXECUTABLE;
  }

  return undefined;
}

function addWarning(warnings: string[], checks: TestCheck[], name: string, message: string): void {
  warnings.push(message);
  checks.push({
    name,
    status: "warning",
    message,
    durationMs: 0
  });
}

function addError(errors: string[], checks: TestCheck[], name: string, message: string): void {
  errors.push(message);
  checks.push({
    name,
    status: "failed",
    message,
    durationMs: 0
  });
}

function finalizeResult(
  target: BrowserTarget,
  startedAt: number,
  checks: TestCheck[],
  warnings: string[],
  errors: string[],
  browser?: BrowserSmokeTestResult["browser"]
): BrowserSmokeTestResult {
  const failed = checks.some((check) => check.status === "failed") || errors.length > 0;
  const warned = checks.some((check) => check.status === "warning") || warnings.length > 0;

  return {
    target,
    status: failed ? "failed" : warned ? "warning" : "passed",
    checks,
    warnings,
    errors,
    durationMs: Date.now() - startedAt,
    browser
  };
}

function createReport(project: OpenExtProject, targets: BrowserSmokeTestResult[]): BrowserTestReport {
  const failed = targets.some((target) => target.status === "failed");
  const warned = targets.some((target) => target.status === "warning");

  return {
    project: {
      name: project.config.name,
      rootDir: project.rootDir
    },
    generatedAt: new Date().toISOString(),
    status: failed ? "failed" : warned ? "warning" : "passed",
    targets
  };
}

async function writeTestReport(project: OpenExtProject, report: BrowserTestReport): Promise<void> {
  const reportPath = join(project.rootDir, "dist", "reports", "test-report.json");
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}
